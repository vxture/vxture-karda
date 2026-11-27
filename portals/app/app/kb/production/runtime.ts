import {Pool} from 'pg';
import {ProductionStore} from './store';
import {ProductionEngine} from './engine';
import {PostgresSemanticStore} from '../semantic/store-postgres';
import {getObjectStore} from '../storage/objectstore';
import {authorizedRoster} from '../../platform/roster';
import {getEntitlementResolver} from '../../entitlement/resolver';
import {hasProductAccess} from '../../entitlement/types';
import {tenantForWorkspace} from '../processing/atlas-embedder';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
export async function admitProductionOwner(who:SemanticReadIdentity){const tenant=await tenantForWorkspace(who.workspaceId);if(!tenant)return false;const context={orgId:tenant,workspaceId:who.workspaceId};const roster=await authorizedRoster(context);if(!roster.items.some(m=>m.subject===who.sub))return false;return hasProductAccess(await getEntitlementResolver().resolve(who.workspaceId,context));}
let busy=false,started=false,cursor:string|null=null;
export async function productionPass(){if(busy||!process.env.DATABASE_URL)return 0;busy=true;const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,statement_timeout:15000,connectionTimeoutMillis:5000,allowExitOnIdle:true});let mutex;
 try{mutex=await pool.connect();if(!(await mutex.query('SELECT pg_try_advisory_lock(1903240,41) AS locked')).rows[0].locked)return 0;const objects=getObjectStore(),store=new ProductionStore(pool,objects,admitProductionOwner),engine=new ProductionEngine(store,new PostgresSemanticStore(pool,objects,admitProductionOwner));
  const plans=(await pool.query("SELECT id,workspace_id,created_by FROM karda_kb.production_plan WHERE state='active' AND EXISTS(SELECT 1 FROM karda_kb.production_unit u JOIN karda_kb.production_step s ON s.unit_id=u.id WHERE u.plan_id=production_plan.id AND s.state IN ('queued','waiting','review','running')) AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 20",[cursor])).rows;if(!plans.length)cursor=null;else cursor=plans.at(-1).id;let ran=0;
  for(const p of plans){const who={workspaceId:p.workspace_id,sub:p.created_by,roles:[],productCode:'karda'};try{const w=await store.claim(who,p.id);if(w){await engine.run(who,w);ran++;}}catch{await pool.query("UPDATE karda_kb.production_step SET error_code='production_authority_unavailable' WHERE unit_id IN (SELECT id FROM karda_kb.production_unit WHERE plan_id=$1) AND state IN ('queued','waiting','review')",[p.id]).catch(()=>{});}}
  return ran;
 }finally{if(mutex){await mutex.query('SELECT pg_advisory_unlock(1903240,41)').catch(()=>{});mutex.release();}await pool.end();busy=false;}}
export function startProductionDispatch(){if(started)return;started=true;setTimeout(()=>{void productionPass().catch(()=>{});},4000).unref();setInterval(()=>{void productionPass().catch(()=>{});},10000).unref();}

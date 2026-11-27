import {Pool} from 'pg';
import {PushStore} from './store';
import {PushWorker} from './worker';
import {admitProductionOwner} from '../production/runtime';
import {pushFailure} from './contract';
let busy=false,started=false,cursor:string|null=null;
export async function pushPass(){if(busy||!process.env.DATABASE_URL)return 0;busy=true;const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});let mutex;try{
 mutex=await pool.connect();if(!(await mutex.query('SELECT pg_try_advisory_lock(1903240,42) AS locked')).rows[0].locked)return 0;const store=new PushStore(pool,admitProductionOwner),worker=new PushWorker(store);
 const consumers=(await pool.query("SELECT id,workspace_id,created_by FROM karda_kb.knowledge_push_consumer c WHERE state<>'disabled' AND ($1::uuid IS NULL OR id>$1) AND (state='active' OR EXISTS(SELECT 1 FROM karda_kb.knowledge_push_delivery d WHERE d.consumer_id=c.id AND d.state IN ('queued','retry','leased'))) ORDER BY id LIMIT 20",[cursor])).rows;cursor=consumers.length?consumers.at(-1).id:null;let sent=0;
 for(const c of consumers){const who={workspaceId:c.workspace_id,sub:c.created_by,roles:[],productCode:'karda'};try{await store.fanout(who,c.id);const w=await worker.claim(who,c.id);if(w){await worker.run(who,w);sent++;}}catch(e){const code=pushFailure(e).code;await worker.suppress(who,c.id,code==='push_unavailable'?'push_authority_unavailable':code).catch(()=>{});}}
 return sent;
 }finally{if(mutex){await mutex.query('SELECT pg_advisory_unlock(1903240,42)').catch(()=>{});mutex.release();}await pool.end();busy=false;}}
export function startPushDispatch(){if(started)return;started=true;setTimeout(()=>{void pushPass().catch(()=>{});},6000).unref();setInterval(()=>{void pushPass().catch(()=>{});},10000).unref();}

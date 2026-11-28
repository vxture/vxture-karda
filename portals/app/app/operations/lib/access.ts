/**
 * Live explicit product grants; no platform-plane roles are consumed.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {cookies} from 'next/headers';
import {Pool,type PoolClient} from 'pg';
import {operationsConfig} from './config';
import {getAuthUser} from './session';
import {OPS_ROLES,type OpsPermission,type OpsRole} from './identity';
let pool:Pool|undefined;
export function operationsPool(){return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,statement_timeout:15000});}
export async function operator(){const cfg=operationsConfig();if(!cfg.enabled)throw Error('operations_not_configured');const sid=(await cookies()).get(cfg.cookieName)?.value;if(!sid)throw Error('operations_unauthenticated');const sub=await getAuthUser(cfg,sid);if(!sub)throw Error('operations_unauthenticated');return sub;}
export async function authorize(db:PoolClient,sub:string,permission:OpsPermission){
 const row=(await db.query<{roles:OpsRole[];status:string}>('SELECT roles,status FROM karda_kb.ops_member WHERE sub=$1 FOR SHARE',[sub])).rows[0];
 if(row?.status!=='active'||!row.roles.some(r=>Object.hasOwn(OPS_ROLES,r)&&(OPS_ROLES[r] as readonly string[]).includes(permission)))throw Error('operations_forbidden');return row.roles;
}
export async function transaction<T>(sub:string,permission:OpsPermission,work:(db:PoolClient)=>Promise<T>){const db=await operationsPool().connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(1903240,49)');await authorize(db,sub,permission);const result=await work(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}

/** Release the owned pool during integration teardown. */
export async function closeOperationsPool(){const active=pool;pool=undefined;if(active)await active.end();}

/**
 * Current platform eligibility plus scoped local business roles; no legacy bypass.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-29
 */
import {cookies} from 'next/headers';
import {Pool,type PoolClient} from 'pg';
import {operationsConfig} from './config';
import {getAuthUser} from './session';
import {type OpsPermission} from './identity';
import {currentAuthority,validateAssociation,runtimeAuthority,withPlatformAuthority,type ProductAssociation} from './authority';
let pool:Pool|undefined;
export function operationsPool(){return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,statement_timeout:15000});}
export async function operatorContext(){const cfg=operationsConfig();if(!cfg.enabled)throw Error('operations_not_configured');const sid=(await cookies()).get(cfg.cookieName)?.value;if(!sid)throw Error('operations_unauthenticated');const sub=await getAuthUser(cfg,sid);if(!sub)throw Error('operations_unauthenticated');return{sub,rpsid:sid};}
export async function operator(){return(await operatorContext()).sub;}
export function withOperatorAuthority<T>(actor:{sub:string;rpsid:string},work:()=>Promise<T>){return withPlatformAuthority(runtimeAuthority(actor),work);}
export interface Grant {id:string;role_id:string;code:string;permissions:OpsPermission[];scope:{type:'product'}|{type:'libraries';ids:string[]};revision:number}
export interface Access {association:ProductAssociation;grants:Grant[];permissions:OpsPermission[]}
export function permits(access:Access,permission:OpsPermission,libraryId?:string){if(permission==='operations.enter')return true;if(permission==='members.manage'||permission==='roles.manage')return access.association.role==='owner';return access.grants.some(g=>g.permissions.includes(permission)&&(g.scope.type==='product'||!!libraryId&&g.scope.ids.includes(libraryId)));}
export function requirePermission(access:Access,permission:OpsPermission,libraryId?:string){if(!permits(access,permission,libraryId))throw Error('operations_forbidden');}
/** Mirrors observed facts for management display, never treats that mirror as authority. */
export async function readAccess(db:PoolClient,sub:string,association:ProductAssociation):Promise<Access>{
 const previous=(await db.query('SELECT active,authority_version,environment FROM karda_kb.ops_platform_member WHERE sub=$1 FOR UPDATE',[sub])).rows[0];
 if(previous&&previous.environment===association.environment&&BigInt(previous.authority_version)>BigInt(association.authorizationVersion))throw Error('operations_authority_stale');
 if(previous&&(!previous.active||previous.environment!==association.environment))await db.query("UPDATE karda_kb.ops_role_assignment SET state='suspended',revision=revision+1,updated_at=now() WHERE sub=$1 AND state='active'",[sub]);
 await db.query("INSERT INTO karda_kb.ops_platform_member(sub,platform_role,active,authority_version,environment) VALUES($1,$2,true,$3,$4) ON CONFLICT(sub) DO UPDATE SET platform_role=EXCLUDED.platform_role,active=true,authority_version=EXCLUDED.authority_version,environment=EXCLUDED.environment,observed_at=now()",[sub,association.role,association.authorizationVersion,association.environment]);
 const grants=(await db.query<Grant>("SELECT a.id,a.role_id,r.code,r.permissions,a.scope,a.revision FROM karda_kb.ops_role_assignment a JOIN karda_kb.ops_role r ON r.id=a.role_id WHERE a.sub=$1 AND a.state='active' AND r.state='active' ORDER BY a.id FOR SHARE OF a,r",[sub])).rows;
 const permissions=new Set<OpsPermission>(['operations.enter']);if(association.role==='owner'){permissions.add('members.manage');permissions.add('roles.manage');}for(const g of grants)for(const p of g.permissions)if(p!=='members.manage'&&p!=='roles.manage')permissions.add(p);
 return{association,grants,permissions:[...permissions]};
}
export async function authorize(db:PoolClient,sub:string,permission:OpsPermission,libraryId?:string){const authority=currentAuthority(),association=validateAssociation(await authority.access(),sub,authority.environment),access=await readAccess(db,sub,association);requirePermission(access,permission,libraryId);return access;}
export async function transaction<T>(sub:string,permission:OpsPermission,work:(db:PoolClient,access:Access)=>Promise<T>,libraryId?:string){const authority=currentAuthority();const db=await operationsPool().connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(1903240,49)');const access=await authorize(db,sub,permission,libraryId);const result=await work(db,access);const after=validateAssociation(await authority.access(),sub,authority.environment);if(after.authorizationVersion!==access.association.authorizationVersion||after.role!==access.association.role)throw Error('operations_authority_changed');await db.query('COMMIT');return result; }catch(e){await db.query('ROLLBACK');if(e instanceof Error&&e.message==='operations_not_associated'){try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(1903240,49)');await db.query("UPDATE karda_kb.ops_platform_member SET active=false,observed_at=now() WHERE sub=$1",[sub]);await db.query("UPDATE karda_kb.ops_role_assignment SET state='suspended',revision=revision+1,updated_at=now() WHERE sub=$1 AND state='active'",[sub]);await db.query('COMMIT');}catch{await db.query('ROLLBACK');}}throw e;}finally{db.release();}}
export async function closeOperationsPool(){const active=pool;pool=undefined;if(active)await active.end();}

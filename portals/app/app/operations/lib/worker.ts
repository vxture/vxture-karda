/**
 * Durable native public-job dispatch with live workforce and product authority.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import type {Pool} from 'pg';
import {operationsPool} from './access';
import {operationsConfig} from './config';
import {openDelegation} from './delegation';
import {getAuthUser,type SessionDeps} from './session';
import {getSession,rotateSession,withSessionLock,deleteSessionsBySid} from '../../auth/lib/session-store';
import {verifyToken} from '../../auth/lib/oidc';
import {checkCentralSession} from '../../auth/lib/central-session';
import {processJob,audit} from './store';
interface QueuedJob {id:string;library_id:string;created_by:string;delegation_cipher:string;revision:number;dispatch_attempt:number}
export interface DispatchDeps {pool:Pool;secret:string;resolve:(rpsid:string)=>Promise<string|null>;now:()=>number;run:typeof processJob}
/** Persist a bounded transport retry or require explicit reauthorization. */
async function postpone(deps:DispatchDeps,job:QueuedJob,code:string,transient=false){const db=await deps.pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(1903240,49)');const terminal=!transient||job.dispatch_attempt>=2;const changed=await db.query("UPDATE karda_kb.public_job SET state=$4,delegation_cipher=CASE WHEN $4='paused' THEN NULL ELSE delegation_cipher END,error_code=$5,dispatch_attempt=dispatch_attempt+1,next_attempt_at=now()+make_interval(secs=>$6),revision=revision+1,updated_at=now() WHERE id=$1 AND state='queued' AND mode='automatic' AND delegation_cipher IS NOT DISTINCT FROM $2 AND revision=$3 RETURNING library_id",[job.id,job.delegation_cipher,job.revision,terminal?'paused':'queued',code,30*2**job.dispatch_attempt]);if(changed.rowCount)await audit(db,'service:karda-public-jobs',terminal?'job_blocked':'job_deferred',job.library_id,'Background authority or transport check',{jobId:job.id,code,requiresReauthorization:terminal});await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
/** Each candidate is rechecked; decrypted session references never leave this module. */
export async function dispatchPublicJobs(deps:DispatchDeps){const mutex=await deps.pool.connect();let locked=false;const counts={completed:0,paused:0,deferred:0,skipped:0};try{
 locked=(await mutex.query('SELECT pg_try_advisory_lock(1903240,50) AS locked')).rows[0].locked;if(!locked)return counts;
 const jobs=(await deps.pool.query<QueuedJob>("SELECT id,library_id,created_by,delegation_cipher,revision,dispatch_attempt FROM karda_kb.public_job WHERE state='queued' AND mode='automatic' AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT 5")).rows;
 for(const job of jobs){let delegation;try{delegation=openDelegation(deps.secret,job.delegation_cipher,job.id,job.library_id,deps.now());}catch{await postpone(deps,job,'operations_delegation_invalid');counts.paused++;continue;}
 let sub:string|null;try{sub=await deps.resolve(delegation.rpsid);}catch(e){const renewal=e instanceof Error&&e.message==='operations_session_renewal_required';await postpone(deps,job,renewal?'operations_session_renewal_required':'operations_session_unavailable',!renewal);if(renewal)counts.paused++;else counts.deferred++;continue;}
 if(sub!==delegation.sub){await postpone(deps,job,'operations_session_revoked');counts.paused++;continue;}
 try{const result=await deps.run(sub,job.id,{delegationCipher:job.delegation_cipher});if('done'in result&&result.done)counts.completed++;else counts.skipped++;}
 catch(e){const code=e instanceof Error?e.message:'';if(['operations_job_changed','operations_invalid_state'].includes(code)){counts.skipped++;continue;}const denied=code==='operations_forbidden';await postpone(deps,job,denied?'operations_permission_revoked':'operations_dispatch_unavailable',!denied);if(denied)counts.paused++;else counts.deferred++;}
 }return counts;
 }finally{if(locked)await mutex.query('SELECT pg_advisory_unlock(1903240,50)').catch(()=>{});mutex.release();}}
/** Background work must not refresh a person's RP session or simulate activity. */
export const jobSessionDeps:SessionDeps={read:getSession,rotate:rotateSession,lock:withSessionLock,central:checkCentralSession,revoke:deleteSessionsBySid,verify:verifyToken,refresh:async()=>{throw Error('operations_session_renewal_required');},now:()=>Math.floor(Date.now()/1000)};
let started=false,busy=false;
export async function publicJobPass(){const cfg=operationsConfig();if(busy||!cfg.enabled||!process.env.DATABASE_URL||process.env.KARDA_OPS_WORKER_ENABLED==='off')return;busy=true;try{return await dispatchPublicJobs({pool:operationsPool(),secret:cfg.clientSecret,resolve:rpsid=>getAuthUser(cfg,rpsid,jobSessionDeps),now:()=>Math.floor(Date.now()/1000),run:processJob});}finally{busy=false;}}
export function startPublicJobDispatch(){if(started)return;started=true;setTimeout(()=>void publicJobPass().catch(()=>{}),8000).unref();setInterval(()=>void publicJobPass().catch(()=>{}),15000).unref();}

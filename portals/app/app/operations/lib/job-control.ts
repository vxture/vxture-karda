/**
 * Explicit task pause, recovery, cancellation and session rebinding.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {transaction} from './access';
import {operationsConfig} from './config';
import {audit} from './store';
import {record,text,uuid} from './contract';
import {sealDelegation} from './delegation';
export async function controlJob(actor:{sub:string;rpsid:string},value:unknown){const c=record(value),id=uuid(c.id),jobId=uuid(c.jobId),operation=text(c.operation,16),note=text(c.note,2000);
 return transaction(actor.sub,'production.manage',async db=>{
 const library=(await db.query('SELECT revision FROM karda_kb.public_library WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!library)throw Error('operations_not_found');if(library.revision!==c.expectedRevision)throw Error('operations_conflict');
 const job=(await db.query('SELECT * FROM karda_kb.public_job WHERE id=$1 AND library_id=$2 FOR UPDATE',[jobId,id])).rows[0];if(!job)throw Error('operations_not_found');if(job.revision!==c.expectedJobRevision)throw Error('operations_conflict');if(['done','cancelled'].includes(job.state))throw Error('operations_invalid_state');
 let state=job.state,mode=job.mode,cipher:string|null=null;
 if(operation==='pause'){if(job.state!=='queued')throw Error('operations_invalid_state');state='paused';}
 else if(operation==='cancel')state='cancelled';
 else if(operation==='resume'||operation==='retry'||operation==='automatic'){
 if(operation==='resume'&&job.state!=='paused'||operation==='retry'&&job.state!=='failed'||operation==='automatic'&&!['queued','paused'].includes(job.state))throw Error('operations_invalid_state');
 if(job.attempt>=3)throw Error('operations_retry_exhausted');
 const source=(await db.query("SELECT revision,payload FROM karda_kb.public_artifact WHERE id=$1 AND library_id=$2 AND kind='source' FOR SHARE",[job.source_id,id])).rows[0];if(!source||source.revision!==job.source_revision||source.payload.archived===true)throw Error('operations_source_changed');
 state='queued';if(operation==='automatic')mode='automatic';
 if(mode==='automatic'){const cfg=operationsConfig();if(!cfg.enabled)throw Error('operations_not_configured');cipher=sealDelegation(cfg.clientSecret,{jobId,libraryId:id,sub:actor.sub,rpsid:actor.rpsid,expiresAt:Math.floor(Date.now()/1000)+Math.min(86400,cfg.sessionTtlSeconds)});}
 }else if(operation==='manual'){mode='manual';if(job.state==='paused')state='queued';}else throw Error('operations_invalid_action');
 await db.query('UPDATE karda_kb.public_job SET state=$2,mode=$3,delegation_cipher=$4,revision=revision+1,dispatch_attempt=0,next_attempt_at=now(),error_code=NULL,updated_at=now() WHERE id=$1',[jobId,state,mode,cipher]);
 await db.query('UPDATE karda_kb.public_library SET revision=revision+1,updated_at=now() WHERE id=$1',[id]);await audit(db,actor.sub,'job_'+operation,id,note,{jobId,before:{state:job.state,mode:job.mode},after:{state,mode}});return{id,jobId};
 },id);}

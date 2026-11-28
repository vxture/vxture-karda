/**
 * Bound, expiring and encrypted operations-session delegation for native jobs.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {uuid} from './contract';
export interface JobDelegation {jobId:string;libraryId:string;sub:string;rpsid:string;expiresAt:number}
function key(secret:string){if(secret.length<16)throw Error('operations_delegation_unconfigured');return createHash('sha256').update('karda:public-job:session:v1\0'+secret).digest();}
function valid(value:JobDelegation,jobId:string,libraryId:string,now:number){uuid(value.jobId);uuid(value.libraryId);if(value.jobId!==jobId||value.libraryId!==libraryId||!/^opr_[a-f0-9-]{36}$/i.test(value.sub)||typeof value.rpsid!=='string'||value.rpsid.length<16||value.rpsid.length>512||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now||value.expiresAt>now+86400)throw Error('operations_delegation_invalid');return value;}
export function sealDelegation(secret:string,value:JobDelegation,now=Math.floor(Date.now()/1000)){valid(value,value.jobId,value.libraryId,now);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from('karda.public-job.v1'));const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64url');}
export function openDelegation(secret:string,ciphertext:string,jobId:string,libraryId:string,now=Math.floor(Date.now()/1000)):JobDelegation{try{if(typeof ciphertext!=='string'||ciphertext.length>4096)throw Error();const raw=Buffer.from(ciphertext,'base64url');if(raw.length<30)throw Error();const decipher=createDecipheriv('aes-256-gcm',key(secret),raw.subarray(0,12));decipher.setAAD(Buffer.from('karda.public-job.v1'));decipher.setAuthTag(raw.subarray(12,28));return valid(JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8')),jobId,libraryId,now);}catch{throw Error('operations_delegation_invalid');}}

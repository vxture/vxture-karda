/**
 * Delegation encryption, task binding, expiry and rotation boundary tests.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sealDelegation,openDelegation} from './delegation';
const secret='fixture-only-operations-key-32-characters',now=1700000000;
function value(){return{jobId:randomUUID(),libraryId:randomUUID(),sub:'opr_'+randomUUID(),rpsid:'fixture-session-reference-'+randomUUID(),expiresAt:now+3600};}
test('encrypted delegation exposes no session reference and binds exact job and library',()=>{const v=value(),cipher=sealDelegation(secret,v,now);assert.ok(!cipher.includes(v.rpsid));assert.deepEqual(openDelegation(secret,cipher,v.jobId,v.libraryId,now),v);assert.throws(()=>openDelegation(secret,cipher,randomUUID(),v.libraryId,now));assert.throws(()=>openDelegation(secret,cipher,v.jobId,randomUUID(),now));});
test('expired, altered or rotated-key delegation cannot authorize work',()=>{const v=value(),cipher=sealDelegation(secret,v,now);assert.throws(()=>openDelegation(secret,cipher,v.jobId,v.libraryId,now+3600));const raw=Buffer.from(cipher,'base64url');raw[30]^=1;assert.throws(()=>openDelegation(secret,raw.toString('base64url'),v.jobId,v.libraryId,now));assert.throws(()=>openDelegation(secret+'rotated',cipher,v.jobId,v.libraryId,now));});
test('delegation rejects tenant subjects and indefinite grants',()=>{const v=value();assert.throws(()=>sealDelegation(secret,{...v,sub:'usr_'+randomUUID()},now));assert.throws(()=>sealDelegation(secret,{...v,expiresAt:now+86401},now));});

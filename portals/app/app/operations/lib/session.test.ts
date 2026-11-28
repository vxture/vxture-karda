/**
 * Independent workforce refresh and revocation authority tests.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {JWTPayload} from 'jose';
import {getAuthUser,operationsSubjectToken,type SessionDeps} from './session';
import type {OidcConfig} from '../../auth/lib/config';
import type {RpSession} from '../../auth/lib/session-store';
const sub='opr_'+randomUUID();
function fixture(claims:JWTPayload){let current:RpSession|null={sub,sid:'employee-sid',accessToken:'current',idToken:'id',accessExpiresAt:5000,centralNextCheckAt:6000};const cfg={clientId:'karda-operations'} as OidcConfig;const deps:SessionDeps={read:async()=>current,rotate:async()=>true,lock:async(_cid,_id,work)=>work('lease'),central:async()=>({valid:true,next_check_at:6000}),revoke:async()=>{current=null;},verify:async()=>claims,refresh:async()=>{throw Error('unused refresh');},now:()=>1000};return{cfg,deps,expire:()=>{if(current)current.centralNextCheckAt=0;},revoked:()=>current===null};}
test('workforce session resolves only its verified operator subject',async()=>{const f=fixture({sub,userType:'operator',exp:5000,sid:'employee-sid'});assert.equal(await getAuthUser(f.cfg,'operations-session',f.deps),sub);});
test('customer identity cannot pass an operations RP session',async()=>{const user='usr_'+randomUUID(),f=fixture({sub:user,userType:'tenant_user',exp:5000});await assert.rejects(getAuthUser(f.cfg,'operations-session',f.deps));});
test('central workforce revocation destroys the operations session',async()=>{const f=fixture({sub,userType:'operator',exp:5000,sid:'employee-sid'});f.expire();f.deps.central=async()=>({valid:false});assert.equal(await getAuthUser(f.cfg,'operations-session',f.deps),null);assert.equal(f.revoked(),true);});

test('delegation token stays server-side and rejects customer, management, missing scope and mixed audiences',async()=>{const claims={sub,userType:'operator',exp:5000,sid:'employee-sid',jti:'jti',scope:'openid profile',roles:[],aud:'karda-operations'};const f=fixture(claims);assert.equal(await operationsSubjectToken(f.cfg,{sub,rpsid:'session'},f.deps),'current');for(const changes of [{scope:'profile'},{aud:['karda-operations','opera']},{act:{sub}},{mode:'obo'},{active_workspace:null},{jti:undefined}]){const bad=fixture({...claims,...changes});await assert.rejects(operationsSubjectToken(bad.cfg,{sub,rpsid:'session'},bad.deps));}await assert.rejects(operationsSubjectToken(f.cfg,{sub:'opr_'+randomUUID(),rpsid:'session'},f.deps));});

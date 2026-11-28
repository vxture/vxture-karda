/**
 * Authority and provenance boundary regression tests.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {artifact,hash,validateSnapshot,projection,type Artifact,roles} from './contract';
import {workforce} from './identity';
const sourceId=randomUUID(),itemId=randomUUID();
function fixture():Artifact[]{const p=artifact('source',{title:'Official source',url:'https://example.gov/source',issuer:'Issuer',edition:'2026',validity:'current',rights:'Public source checked',text:'Contract evidence'});return[{id:sourceId,kind:'source',payload:p,revision:1,created_by:'opr_'+randomUUID()},{id:itemId,kind:'item',payload:artifact('item',{title:'Obligation',statement:'Evidence',sourceId,sourceHash:p.contentHash,start:0,end:8,category:'LEG',conditions:'Contract applies',exceptions:'None confirmed'}),revision:1,created_by:'opr_'+randomUUID()}];}
test('workforce identity rejects customer, wrong realm and tenant context',()=>{assert.equal(workforce({sub:'opr_'+sourceId,userType:'operator'}),'opr_'+sourceId);for(const c of [{sub:'usr_'+sourceId,userType:'tenant_user'},{sub:'opr_'+sourceId,userType:'operator',realm:'customer'},{sub:'opr_'+sourceId,userType:'operator',active_workspace:randomUUID()}])assert.throws(()=>workforce(c));});
test('product roles reject platform-plane codes',()=>{assert.deepEqual(roles(['editor','reviewer']),['editor','reviewer']);assert.throws(()=>roles(['admin.plane']));assert.throws(()=>roles(['editor','editor']));});
test('published knowledge requires bounded current evidence',()=>{const a=fixture();validateSnapshot(a);a[0].payload.contentHash='a'.repeat(64);assert.throws(()=>validateSnapshot(a),/stale_evidence/);});
test('unknown or withdrawn source cannot support publication',()=>{for(const state of ['unknown','withdrawn']){const a=fixture();a[0].payload.validity=state;assert.throws(()=>validateSnapshot(a));}});
test('item reference cannot exceed original source',()=>{const a=fixture();a[1].payload.end=999;assert.throws(()=>validateSnapshot(a));});
test('relations require local item endpoints and source evidence',()=>{const a=fixture();a.push({id:randomUUID(),kind:'relation',payload:{title:'Relation',sourceId:itemId,targetId:randomUUID(),evidenceId:sourceId,type:'requires'},revision:1,created_by:'opr_'+randomUUID()});assert.throws(()=>validateSnapshot(a),/invalid_relation/);});
test('graph derives real evidence links and release hash changes with source',()=>{const a=fixture();assert.equal(projection(a).edges[0].target,sourceId);const before=hash(a);a[0].payload.edition='2027';assert.notEqual(hash(a),before);});
test('source URL and provenance validation rejects insecure origin and invalid ranges',()=>{assert.throws(()=>artifact('source',{title:'x',url:'http://example.com'}));assert.throws(()=>artifact('item',{title:'x',start:-1,end:0}));});

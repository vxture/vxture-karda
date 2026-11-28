/**
 * Platform association and scoped-role contract boundary tests.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-29
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {memberSnapshot,validateAssociation,runtimeAuthority,type PlatformAuthority} from './authority';
import {accountsAuthority} from './platform-contract';
import {businessPermissions,roleScope} from './roles';
import {permits,type Access} from './access';
const sub='opr_'+randomUUID(),other='opr_'+randomUUID();
const association={product:'karda' as const,subject:sub,authorized:true,role:'owner' as const,authorizationVersion:'90071992547409930',environment:'test'};
test('multiple owner association is scoped to current product,employee and environment',()=>{assert.equal(validateAssociation(association,sub,'test').role,'owner');assert.throws(()=>validateAssociation(association,other,'test'));assert.throws(()=>validateAssociation(association,sub,'production'));assert.throws(()=>validateAssociation({...association,product:'arda' as 'karda'},sub,'test'));assert.throws(()=>validateAssociation({...association,authorized:false,role:null},sub,'test'),/not_associated/);});
test('owner manages authorization without automatic content rights; member cannot manufacture owner permissions',()=>{const access:Access={association,grants:[],permissions:['operations.enter','members.manage','roles.manage']};assert.equal(permits(access,'members.manage'),true);assert.equal(permits(access,'content.publish'),false);assert.throws(()=>businessPermissions(['members.manage']));assert.throws(()=>businessPermissions(['roles.manage']));assert.throws(()=>businessPermissions(['made.up']));});
test('library grants cannot cross into another library or global creation',()=>{const id=randomUUID(),access:Access={association:{...association,role:'member'},permissions:['content.read'],grants:[{id:randomUUID(),role_id:randomUUID(),code:'reader',permissions:['content.read'],scope:{type:'libraries',ids:[id]},revision:1}]};assert.equal(permits(access,'content.read',id),true);assert.equal(permits(access,'content.read',randomUUID()),false);assert.equal(permits(access,'content.read'),false);assert.throws(()=>roleScope({type:'libraries',ids:[]}));});
test('directory requires owner, complete same-version pages and a final current authority check',async()=>{let calls=0;const p:PlatformAuthority={environment:'test',access:async()=>association,members:async cursor=>{calls++;return{items:[{subject:cursor?other:sub,displayName:'Fixture',role:cursor?'member':'owner',employeeActive:true}],nextCursor:cursor?null:'page-2',authorizationVersion:association.authorizationVersion};}};assert.equal((await memberSnapshot(p,sub)).items.length,2);assert.equal(calls,2);await assert.rejects(memberSnapshot({...p,access:async()=>({...association,role:'member'})},sub),/forbidden/);await assert.rejects(memberSnapshot({...p,members:async()=>({items:[],nextCursor:null,authorizationVersion:'2'})},sub),/directory_changed/);});
test('Accounts transport preserves authentication errors and unavailable state',async()=>{for(const [status,code]of [[401,'unauthenticated'],[503,'authority_unavailable']]as const){const p=accountsAuthority(sub,'test',randomUUID(),{self:async()=>({status,body:{}}),members:async()=>({status:503,body:{}})});await assert.rejects(p.access(),new RegExp(code));}const prior=process.env.KARDA_OPS_ENABLED;try{process.env.KARDA_OPS_ENABLED='off';await assert.rejects(runtimeAuthority({sub,rpsid:'ignored'}).access(),/not_configured/);}finally{if(prior===undefined)delete process.env.KARDA_OPS_ENABLED;else process.env.KARDA_OPS_ENABLED=prior;}});

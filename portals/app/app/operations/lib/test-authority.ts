/**
 * Test-only platform authority fixture; never imported by production entrypoints.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-29
 */
import {withPlatformAuthority,type PlatformAuthority} from './authority';
import {operationsPool} from './access';
export async function testAuthority<T>(sub:string,work:()=>Promise<T>){const pool=operationsPool();const authority:PlatformAuthority={environment:'test',access:async()=>{const m=(await pool.query('SELECT status FROM karda_kb.ops_member WHERE sub=$1',[sub])).rows[0];return{product:'karda',subject:sub,authorized:m?.status==='active',role:m?.status==='active'?'member':null,authorizationVersion:'1',environment:'test'};},members:async()=>{throw Error('No directory in legacy fixture');}};return withPlatformAuthority(authority,work);}
export async function seedTestGrants(sub:string,roleCodes:readonly string[]){const pool=operationsPool();for(const code of [...roleCodes,...(roleCodes.includes('editor')?['librarian']:[])])await pool.query("INSERT INTO karda_kb.ops_role_assignment(id,sub,role_id,scope,state,created_by) SELECT gen_random_uuid(),$1,id,'{\"type\":\"product\"}','active','test-fixture' FROM karda_kb.ops_role WHERE code=$2 ON CONFLICT(sub,role_id) DO NOTHING",[sub,code]);}

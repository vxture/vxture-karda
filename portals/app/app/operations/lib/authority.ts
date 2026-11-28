/**
 * Platform authority boundary; draft contracts cannot enable production access.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-29
 */
import {AsyncLocalStorage} from 'node:async_hooks';
export interface ProductAssociation {product:'karda';subject:string;authorized:boolean;role:'owner'|'member'|null;authorizationVersion:string;environment:string}
export interface PlatformMember {subject:string;displayName:string;role:'owner'|'member';employeeActive:boolean}
export interface MemberPage {items:PlatformMember[];nextCursor:string|null;authorizationVersion:string}
export interface PlatformAuthority {access():Promise<ProductAssociation>;members(cursor:string|null):Promise<MemberPage>;environment:string}
const context=new AsyncLocalStorage<PlatformAuthority>();
export function withPlatformAuthority<T>(authority:PlatformAuthority,work:()=>Promise<T>){return context.run(authority,work);}
export function currentAuthority(){const value=context.getStore();if(!value)throw Error('operations_authority_unavailable');return value;}
export function validateAssociation(value:ProductAssociation,sub:string,environment:string){if(value.product!=='karda'||value.subject!==sub||!/^opr_[a-f0-9-]{36}$/i.test(sub)||value.environment!==environment||!/^\d{1,40}$/.test(value.authorizationVersion)||typeof value.authorized!=='boolean'||value.authorized&&!['owner','member'].includes(String(value.role))||!value.authorized&&value.role!==null)throw Error('operations_authority_invalid');if(!value.authorized)throw Error('operations_not_associated');return value;}
/** An integration transport must be installed in code only after a released platform contract is pinned.
 * No environment switch, caller header or draft endpoint can manufacture platform authority. */
export function runtimeAuthority(_actor:{sub:string;rpsid:string}):PlatformAuthority{return{environment:process.env.DEPLOY_STAGE??'production',access:async()=>{throw Error('operations_authority_not_integrated');},members:async()=>{throw Error('operations_authority_not_integrated');}};}
export async function memberSnapshot(authority:PlatformAuthority,owner:string){const access=validateAssociation(await authority.access(),owner,authority.environment);if(access.role!=='owner')throw Error('operations_forbidden');let cursor:string|null=null;const seen=new Set<string>(),subjects=new Set<string>(),items:PlatformMember[]=[];for(let page=0;page<100;page++){const result=await authority.members(cursor);if(result.authorizationVersion!==access.authorizationVersion)throw Error('operations_directory_changed');if(!Array.isArray(result.items)||result.items.length>100||result.nextCursor!==null&&typeof result.nextCursor!=='string')throw Error('operations_authority_invalid');for(const m of result.items){if(!/^opr_[a-f0-9-]{36}$/i.test(m.subject)||subjects.has(m.subject)||!['owner','member'].includes(m.role)||typeof m.employeeActive!=='boolean'||typeof m.displayName!=='string'||m.displayName.length>255)throw Error('operations_authority_invalid');subjects.add(m.subject);items.push(m);}if(result.nextCursor===null){const after=validateAssociation(await authority.access(),owner,authority.environment);if(after.role!=='owner'||after.authorizationVersion!==access.authorizationVersion)throw Error('operations_directory_changed');if(!items.some(m=>m.subject===owner&&m.role==='owner'&&m.employeeActive))throw Error('operations_authority_invalid');return{items,authorizationVersion:access.authorizationVersion};}if(seen.has(result.nextCursor))throw Error('operations_authority_invalid');seen.add(result.nextCursor);cursor=result.nextCursor;}throw Error('operations_directory_budget');}

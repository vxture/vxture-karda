/**
 * Draft OPS-07/08 decoding with injected transport; never enabled in production.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-29
 */
import {record,text} from './contract';
import {validateAssociation,type PlatformAuthority,type ProductAssociation,type MemberPage} from './authority';
export type AuthorityResponse={status:number;body:unknown};
export interface DraftTransport {self():Promise<AuthorityResponse>;members(cursor:string|null):Promise<AuthorityResponse>}
function response(r:AuthorityResponse){if(r.status===401)throw Error('operations_unauthenticated');if(r.status===403)throw Error('operations_forbidden');if(r.status===409)throw Error('operations_directory_changed');if(r.status!==200)throw Error('operations_authority_unavailable');return record(r.body);}
export function draftAuthority(actor:string,environment:string,transport:DraftTransport):PlatformAuthority{return{environment,access:async()=>{const p=response(await transport.self());const a:ProductAssociation={product:p.product as 'karda',subject:p.subject as string,authorized:p.authorized as boolean,role:p.role as ProductAssociation['role'],authorizationVersion:p.authorization_version as string,environment};return validateAssociation(a,actor,environment);},members:async cursor=>{const p=response(await transport.members(cursor));if(!Array.isArray(p.items)||typeof p.authorization_version!=='string'||!/^\d{1,40}$/.test(p.authorization_version)||p.next_cursor!==null&&typeof p.next_cursor!=='string')throw Error('operations_authority_invalid');const value:MemberPage={items:p.items.map(v=>{const m=record(v);if(typeof m.employee_active!=='boolean'||!['owner','member'].includes(String(m.role)))throw Error('operations_authority_invalid');return{subject:text(m.subject,128),displayName:text(m.display_name,255),role:m.role as 'owner'|'member',employeeActive:m.employee_active};}),nextCursor:p.next_cursor as string|null,authorizationVersion:p.authorization_version};return value;}};}

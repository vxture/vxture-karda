/**
 * Validate workforce identity without inheriting governance permissions.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import type {JWTPayload} from 'jose';
export function workforce(claims:JWTPayload):string {
 if(typeof claims.sub!=='string'||!/^opr_[a-f0-9-]{36}$/i.test(claims.sub)||claims.userType!=='operator'||
 (claims.realm!==undefined&&claims.realm!=='workforce')||claims.active_workspace||claims.active_org)throw Error('operations_wrong_realm');
 return claims.sub;
}
export const OPS_PERMISSIONS=['operations.enter','members.manage','roles.manage','content.read','content.edit','content.review','content.publish','content.export','audit.read','library.manage','taxonomy.manage','source.manage','production.manage','graph.manage'] as const;
export type OpsPermission=typeof OPS_PERMISSIONS[number];
export const MANAGEMENT_PERMISSIONS:readonly OpsPermission[]=['members.manage','roles.manage'];
export const OPS_ROLES={editor:['operations.enter','content.read','content.edit','source.manage','production.manage','graph.manage'],reviewer:['operations.enter','content.read','content.review'],publisher:['operations.enter','content.read','content.publish','graph.manage'],reader:['operations.enter','content.read'],librarian:['operations.enter','content.read','library.manage','taxonomy.manage','source.manage','production.manage'],auditor:['operations.enter','audit.read']} satisfies Record<string,OpsPermission[]>;
export type OpsRole=keyof typeof OPS_ROLES;

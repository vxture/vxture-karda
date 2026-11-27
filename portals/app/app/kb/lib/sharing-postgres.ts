import type {ProductAccess} from "../../authz/policy";
import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {profileHash} from "../semantic/profile-authority";
import {canPublish,PUBLISH_STATES,type Actor,type PublishState} from "./ownership";
import {parseSharing,SHARING_UUID,type SharingCommand,type SharingImpact,type SharingView} from "./sharing";
interface Library {id:string;name:string;owner_sub:string;publish_state:PublishState;updated_at:Date}
export class PostgresSharing{
 constructor(private pool:Pool,private admit:(who:SemanticReadIdentity)=>Promise<boolean>){}
 private async scope<T>(who:SemanticReadIdentity,kbId:string,work:(db:PoolClient,kb:Library,access:ProductAccess)=>Promise<T>){
  if(!SHARING_UUID.test(kbId)||!SHARING_UUID.test(who.workspaceId)||who.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(who.sub))throw Error("sharing_invalid_scope");
  if(await this.admit(who)!==true)throw Error("sharing_denied");const db=await this.pool.connect();try{
   await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:roles:"+who.workspaceId]);
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:semantic:"+kbId]);
   await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
   const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("sharing_denied");}};
   const access=await readProductAccess(who,sql);if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"service.publish"))throw Error("sharing_denied");
   const kb=(await db.query<Library>("SELECT id,name,owner_sub,publish_state,updated_at FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND deleted_at IS NULL FOR UPDATE",[kbId,who.workspaceId])).rows[0];
   if(!kb||(kb.owner_sub!==who.sub&&!access.roles.some(r=>r==="owner"||r==="administrator")))throw Error("sharing_denied");
   const result=await work(db,kb,access);await db.query("COMMIT");return result;
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
 }
 private actor(who:SemanticReadIdentity,kb:Library,access:ProductAccess):Actor{
  if(kb.owner_sub===who.sub)return {role:"owner",sub:who.sub};
  return access.roles.includes("owner")?{role:"org_admin"}:{role:"ws_admin"};
 }
 private async revision(db:PoolClient,kbId:string){return Number((await db.query("SELECT COALESCE(max(revision),0) AS revision FROM karda_kb.library_sharing_event WHERE kb_id=$1",[kbId])).rows[0].revision);}
 private async impact(db:PoolClient,kbId:string,who:SemanticReadIdentity):Promise<SharingImpact>{
  const a=(await db.query("SELECT count(*)::integer AS attachments,count(DISTINCT product_code)::integer AS products,count(DISTINCT user_sub) FILTER(WHERE user_sub<>$2)::integer AS users FROM karda_kb.kb_attachment WHERE kb_id=$1 AND workspace_id=$3",[kbId,who.sub,who.workspaceId])).rows[0];
  const s=(await db.query("SELECT count(*)::integer AS subscriptions,count(*) FILTER(WHERE delivery_status IN ('leased','retry','dead'))::integer AS pending FROM karda_kb.knowledge_subscription WHERE workspace_id=$1 AND enabled AND (window_request->>'kb_id'=$2 OR (window_request->'kb_ids') ? $2)",[who.workspaceId,kbId])).rows[0];
  return {attachments:a.attachments,consumerProducts:a.products,otherUsers:a.users,activeSubscriptions:s.subscriptions,pendingDeliveries:s.pending};
 }
 private async preview(db:PoolClient,kb:Library,who:SemanticReadIdentity,access:ProductAccess,target:PublishState){
  if(!canPublish({ownerType:"user",ownerSub:kb.owner_sub,workspaceId:who.workspaceId,publishState:kb.publish_state},this.actor(who,kb,access),target).allowed)throw Error("sharing_denied");
  const revision=await this.revision(db,kb.id),impact=await this.impact(db,kb.id,who);
  const previewHash=profileHash(["karda.library-sharing.v1",who.workspaceId,who.sub,kb.id,kb.owner_sub,kb.publish_state,kb.updated_at.toISOString(),revision,target,impact]);
  return {format:"karda.library-sharing-preview.v1" as const,kbId:kb.id,from:kb.publish_state,target,revision,previewHash,impact,checkedAt:new Date().toISOString()};
 }
 async browse(who:SemanticReadIdentity,kbId:string,before?:number):Promise<SharingView>{
  if(before!==undefined&&(!Number.isSafeInteger(before)||before<1||before>2147483647))throw Error("sharing_invalid_request");
  return this.scope(who,kbId,async(db,kb,access)=>{
   const history=(await db.query("SELECT revision,before_state,after_state,note,created_by,created_at,impact FROM karda_kb.library_sharing_event WHERE kb_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 21",[kbId,before??null])).rows;
   return {format:"karda.library-sharing.v1",kbId,name:kb.name,state:kb.publish_state,revision:await this.revision(db,kbId),impact:await this.impact(db,kbId,who),history:history.slice(0,20),nextBefore:history.length>20?history[19].revision:null,
    allowedTargets:PUBLISH_STATES.filter(target=>canPublish({ownerType:"user",ownerSub:kb.owner_sub,workspaceId:who.workspaceId,publishState:kb.publish_state},this.actor(who,kb,access),target).allowed)};
  });
 }
 async mutate(who:SemanticReadIdentity,kbId:string,input:SharingCommand){
  const c=parseSharing(input);return this.scope(who,kbId,async(db,kb,access)=>{
   if(c.action==="preview")return this.preview(db,kb,who,access,c.target);
   const fingerprint=profileHash(c),old=(await db.query("SELECT fingerprint,revision,after_state FROM karda_kb.library_sharing_event WHERE kb_id=$1 AND event_id=$2",[kbId,c.eventId])).rows[0];
   if(old){if(old.fingerprint!==fingerprint)throw Error("sharing_conflict");return {format:"karda.library-sharing-receipt.v1",kbId,revision:old.revision,state:old.after_state,duplicate:true};}
   const preview=await this.preview(db,kb,who,access,c.target);
   if(preview.revision!==c.expectedRevision||preview.previewHash!==c.previewHash)throw Error("sharing_changed");
   if(kb.publish_state===c.target)return {format:"karda.library-sharing-receipt.v1",kbId,revision:preview.revision,state:c.target,duplicate:true};
   if(preview.revision>=2147483646)throw Error("sharing_limit");const revision=preview.revision+1;
   await db.query("UPDATE karda_kb.knowledge_base SET publish_state=$2,updated_at=now() WHERE id=$1",[kbId,c.target]);
   await db.query("INSERT INTO karda_kb.library_sharing_event(kb_id,revision,event_id,fingerprint,before_state,after_state,impact,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[kbId,revision,c.eventId,fingerprint,kb.publish_state,c.target,JSON.stringify(preview.impact),c.note,who.sub]);
   return {format:"karda.library-sharing-receipt.v1",kbId,revision,state:c.target,duplicate:false};
  });
 }
}

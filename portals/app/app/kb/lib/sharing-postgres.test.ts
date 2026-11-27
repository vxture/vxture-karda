import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSharing} from "./sharing-postgres";
import {PostgresSubscriptions} from "../semantic/subscription-store";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("controlled library sharing: current roles, impact-bound preview, atomic CAS history and withdrawal invalidates consumer leases",{skip:!endpoint,timeout:30000},async()=>{
 const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString(),max:3});
 const ws=randomUUID(),kb=randomUUID(),institutional=randomUUID(),sub="usr_"+randomUUID(),other="usr_"+randomUUID(),manager="usr_"+randomUUID(),subscription=randomUUID();const who={workspaceId:ws,sub,roles:[],productCode:"karda"},consumer={...who,sub:other},adminWho={...who,sub:manager};const members:string[]=[];
 const sharing=new PostgresSharing(service,async()=>true),subscriptions=new PostgresSubscriptions(service,{get:async()=>null},async()=>true);
 const apply=async(actor:typeof who,target:"private"|"ws_published"|"org_published",note="Intentional change")=>{const p:any=await sharing.mutate(actor,kb,{action:"preview",target});return {action:"apply" as const,target,eventId:randomUUID(),expectedRevision:p.revision,previewHash:p.previewHash,note};};
 try{
  for(const [subject,role] of [[sub,"member"],[other,"member"],[manager,"administrator"]]){const member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,subject])).rows[0].id;members.push(member);await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code=$2",[member,role]);}
  await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Sharing')",[kb,ws,sub]);
  await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,name) VALUES($1,$2,'tenant','Institutional')",[institutional,ws]);
  assert.equal((await sharing.browse(who,kb)).revision,0);assert.deepEqual((await sharing.browse(who,kb)).allowedTargets,["private","ws_published"]);
  await assert.rejects(sharing.browse(consumer,kb),/sharing_denied/);await assert.rejects(sharing.browse(adminWho,institutional),/sharing_denied/);
  await assert.rejects(sharing.mutate(who,kb,{action:"preview",target:"org_published"}),/sharing_denied/);
  const stale=await apply(who,"ws_published");await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,other,kb]);await assert.rejects(sharing.mutate(who,kb,stale),/sharing_changed/);
  const command=await apply(who,"ws_published");await sharing.mutate(who,kb,command);assert.equal((await sharing.mutate(who,kb,command) as any).duplicate,true);await assert.rejects(sharing.mutate(who,kb,{...command,note:"Changed command"}),/sharing_conflict/);
  assert.equal((await sharing.browse(who,kb)).history.length,1);
  await subscriptions.handle(consumer,{action:"create",id:subscription,name:"Shared consumer",window:{kb_id:kb,entity_ids:[]}});const lease:any=await subscriptions.handle(consumer,{action:"claim",id:subscription,requestId:randomUUID(),expectedDeliveryRevision:0,worker:"consumer"});assert.equal(lease.status,"leased");
  const impact=(await sharing.browse(who,kb)).impact;assert.equal(impact.attachments,1);assert.equal(impact.otherUsers,1);assert.equal(impact.activeSubscriptions,1);assert.equal(impact.pendingDeliveries,1);
  const retract=await apply(who,"private");const outcomes=await Promise.allSettled([sharing.mutate(who,kb,retract),sharing.mutate(who,kb,{...retract,eventId:randomUUID()})]);assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
  await assert.rejects(subscriptions.handle(consumer,{action:"complete",id:subscription,eventId:randomUUID(),leaseId:lease.leaseId,expectedDeliveryRevision:lease.deliveryRevision,sequence:lease.sequence,revision:lease.revision}),/subscription_scope_changed/);
  assert.equal(Number((await admin.query("SELECT count(*) FROM karda_kb.kb_attachment WHERE kb_id=$1",[kb])).rows[0].count),1,"withdrawal preserves attachment record");
  assert.equal((await sharing.browse(who,kb)).state,"private");assert.equal((await sharing.browse(who,kb)).revision,2);
  const org=await apply(adminWho,"org_published");await sharing.mutate(adminWho,kb,org);assert.equal((await sharing.browse(adminWho,kb)).state,"org_published");
  const back=await apply(who,"private");await sharing.mutate(who,kb,back);assert.equal((await sharing.browse(who,kb)).revision,4);
  const page=await sharing.browse(who,kb,3);assert.deepEqual(page.history.map(e=>e.revision),[2,1]);
  await assert.rejects(service.query("UPDATE karda_kb.library_sharing_event SET note='forged' WHERE kb_id=$1",[kb]),/permission denied/);await assert.rejects(service.query("DELETE FROM karda_kb.library_sharing_event WHERE kb_id=$1",[kb]),/permission denied/);
  await assert.rejects(sharing.browse({...who,workspaceId:randomUUID()},kb),/sharing_denied/);
  await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[members[0]]);await assert.rejects(sharing.browse(who,kb),/sharing_denied/);
 }finally{
  await admin.query("DELETE FROM karda_kb.knowledge_subscription WHERE workspace_id=$1",[ws]);await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])",[[kb,institutional]]);for(const id of members){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[id]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[id]);}await service.end();await admin.end();
 }
});

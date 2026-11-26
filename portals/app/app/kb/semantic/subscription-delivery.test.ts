import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseSubscription} from "./subscription";
import {handleDelivery,type DeliveryStored} from "./subscription-delivery";
import {subscriptionFailure} from "./subscription-service";
import type {PoolClient} from "pg";
import type {KnowledgePackage} from "./read-postgres";
const hash="a".repeat(64);
test("delivery commands require CAS, request/lease identity, bounded labels and classified failures",()=>{
 const id=randomUUID(),claim={action:"claim",id,requestId:randomUUID(),expectedDeliveryRevision:0,worker:"worker-a"};assert.deepEqual(parseSubscription(claim),claim);
 for(const patch of [{expectedDeliveryRevision:-1},{worker:" "},{requestId:""},{identity:{}},{expectedDeliveryRevision:undefined}])assert.throws(()=>parseSubscription({...claim,...patch}),/subscription_invalid/);
 assert.deepEqual(parseSubscription({action:"list",deliveryStatus:"dead"}),{action:"list",deliveryStatus:"dead"});
 for(const command of [{action:"fail",id,eventId:randomUUID(),leaseId:randomUUID(),expectedDeliveryRevision:0,reason:"private SQL"},{action:"redrive",id,eventId:randomUUID(),expectedDeliveryRevision:0,note:" "},{action:"delivery_history",id,before:0}])assert.throws(()=>parseSubscription(command),/subscription_invalid/);
 assert.equal(subscriptionFailure(Error("subscription_lease_busy")).status,409);assert.equal(subscriptionFailure(Error("subscription_delivery_pending")).status,409);
});
test("leased delivery fences stale workers, preserves explicit retries and transitions to dead letter at the attempt limit",async()=>{
 const events:any[]=[];const db={query:async(sql:string,args:unknown[])=>{if(sql.startsWith("SELECT fingerprint"))return {rows:[]};if(sql.startsWith("INSERT INTO karda_kb.knowledge_delivery_event"))events.push(args);return {rows:[]};}} as unknown as PoolClient;
 const row={id:randomUUID(),sequence:1,ack_sequence:0,last_revision:hash,delivery_revision:0,delivery_sequence:0,delivery_attempt:0,delivery_status:"ready",delivery_worker:null,lease_id:null,lease_until:null,retry_after:null} as DeliveryStored;
 const claim=()=>({action:"claim" as const,id:row.id,requestId:randomUUID(),expectedDeliveryRevision:row.delivery_revision,worker:"worker-a"});
 const first:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);assert.equal(first.attempt,1);assert.ok(first.leaseId);assert.equal(row.ack_sequence,0);
 await assert.rejects(handleDelivery(db,row,claim(),{} as KnowledgePackage,hash),/subscription_lease_busy/);
 await assert.rejects(handleDelivery(db,row,{action:"complete",id:row.id,eventId:randomUUID(),leaseId:randomUUID(),expectedDeliveryRevision:row.delivery_revision,sequence:1,revision:hash},{} as KnowledgePackage,hash),/subscription_lease_changed/);
 await handleDelivery(db,row,{action:"fail",id:row.id,eventId:randomUUID(),leaseId:first.leaseId,expectedDeliveryRevision:row.delivery_revision,reason:"transient"},{} as KnowledgePackage,hash);assert.equal(row.delivery_status,"retry");assert.ok(row.retry_after);
 const waiting:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);assert.equal(waiting.status,"retry");assert.equal(row.delivery_attempt,1);
 row.retry_after=new Date(0);const second:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);assert.equal(second.attempt,2);
 row.lease_until=new Date(0);const third:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);assert.equal(third.attempt,3);assert.notEqual(third.leaseId,second.leaseId);
 row.lease_until=new Date(0);const exhausted:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);assert.equal(exhausted.status,"dead");assert.equal(row.lease_id,null);assert.equal(row.ack_sequence,0);
 await handleDelivery(db,row,{action:"redrive",id:row.id,eventId:randomUUID(),expectedDeliveryRevision:row.delivery_revision,note:"Operator investigated"},{} as KnowledgePackage,hash);assert.equal(row.delivery_attempt,0);assert.equal(row.delivery_status,"ready");assert.ok(events.length>=6);
 const final:any=await handleDelivery(db,row,claim(),{} as KnowledgePackage,hash);
 await handleDelivery(db,row,{action:"complete",id:row.id,eventId:randomUUID(),leaseId:final.leaseId,expectedDeliveryRevision:row.delivery_revision,sequence:1,revision:hash},{} as KnowledgePackage,hash);assert.equal(row.ack_sequence,1);assert.equal(row.delivery_status,"done");
});
test("delivery ledger structure and grants match fresh and upgrade declarations",()=>{
 const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
 for(const [name,file] of [["KNOWLEDGE DELIVERY","00_baseline.sql"],["KNOWLEDGE DELIVERY LOCKS","98_column_locks.sql"]]){const part=(s:string)=>s.slice(s.indexOf("-- BEGIN "+name),s.indexOf("-- END "+name)+("-- END "+name).length);assert.equal(part(read(file)),part(read("incr/0037_subscription_delivery.sql")));}
});

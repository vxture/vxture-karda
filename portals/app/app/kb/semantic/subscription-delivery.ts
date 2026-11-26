import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import type {KnowledgePackage} from "./read-postgres";
import {profileHash} from "./profile-authority";
import type {DeliveryCommand,DeliveryMetadata,SubscriptionRow} from "./subscription";
export type DeliveryStored=SubscriptionRow&Omit<DeliveryMetadata,"lease_until"|"retry_after">&{
  lease_id:string|null;lease_until:Date|null;retry_after:Date|null};
export function deliveryMetadata(row:DeliveryStored){
  return {delivery_revision:row.delivery_revision,delivery_sequence:row.delivery_sequence,delivery_attempt:row.delivery_attempt,
    delivery_status:row.delivery_status,delivery_worker:row.delivery_worker,lease_until:row.lease_until?.toISOString()??null,retry_after:row.retry_after?.toISOString()??null};
}
interface Receipt {fingerprint:string;revision:number;action:string;status:string;sequence:number;attempt:number}
export async function deliveryEvent(db:PoolClient,row:DeliveryStored,requestId:string,fingerprint:string,action:string,note:string|null,reason:string|null,windowRevision:string|null){
  if(row.delivery_revision>=2147483646)throw Error("subscription_limit");
  row.delivery_revision++;
  await db.query(`UPDATE karda_kb.knowledge_subscription SET delivery_revision=$2,delivery_sequence=$3,delivery_attempt=$4,
    delivery_status=$5,delivery_worker=$6,lease_id=$7,lease_until=$8,retry_after=$9,updated_at=now() WHERE id=$1`,
    [row.id,row.delivery_revision,row.delivery_sequence,row.delivery_attempt,row.delivery_status,row.delivery_worker,row.lease_id,row.lease_until,row.retry_after]);
  await db.query(`INSERT INTO karda_kb.knowledge_delivery_event(subscription_id,revision,request_id,fingerprint,action,status,sequence,attempt,worker,note,reason,window_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[row.id,row.delivery_revision,requestId,fingerprint,action,row.delivery_status,row.delivery_sequence,
    row.delivery_attempt,row.delivery_worker,note,reason,windowRevision]);
}
export function clearDeliveryLease(row:DeliveryStored){row.lease_id=null;row.lease_until=null;}
export async function observeSubscription(db:PoolClient,row:DeliveryStored,revision:string){
  if(row.last_revision===revision)return;
  if(row.sequence>=2147483646)throw Error("subscription_limit");
  row.sequence++;row.last_revision=revision;
  await db.query("INSERT INTO karda_kb.knowledge_subscription_event(subscription_id,sequence,revision) VALUES($1,$2,$3)",[row.id,row.sequence,revision]);
  await db.query("UPDATE karda_kb.knowledge_subscription SET sequence=$2,last_revision=$3,updated_at=now() WHERE id=$1",[row.id,row.sequence,revision]);
}
export async function handleDelivery(db:PoolClient,row:DeliveryStored,c:DeliveryCommand,knowledge:KnowledgePackage,windowRevision:string){
  const requestId=c.action==="claim"?c.requestId:c.eventId,fingerprint=profileHash(c);
  const receipt=(await db.query<Receipt>("SELECT fingerprint,revision,action,status,sequence,attempt FROM karda_kb.knowledge_delivery_event WHERE subscription_id=$1 AND request_id=$2",[row.id,requestId])).rows[0];
  const response=()=>({format:"karda.subscription-lease.v1",id:row.id,deliveryRevision:row.delivery_revision,status:row.delivery_status,
    sequence:row.sequence,ackSequence:row.ack_sequence,attempt:row.delivery_attempt,retryAfter:row.retry_after?.toISOString()??null,
    leaseUntil:row.lease_until?.toISOString()??null,replay:"current_window_only"});
  const leased=()=>({...response(),revision:windowRevision,leaseId:row.lease_id,worker:row.delivery_worker,knowledge,action:"replace",reuse:"revalidate"});
  if(receipt){
    if(receipt.fingerprint!==fingerprint)throw Error("subscription_conflict");
    if(c.action==="claim"){
      if(receipt.status!=="leased")return {format:"karda.subscription-receipt.v1",id:row.id,deliveryRevision:receipt.revision,status:receipt.status,duplicate:true};
      if(row.last_revision!==windowRevision||row.delivery_revision!==receipt.revision||row.delivery_status!=="leased"||!row.lease_id||!row.lease_until||row.lease_until.getTime()<=Date.now()||row.delivery_sequence!==row.sequence)throw Error("subscription_lease_changed");
      return {...leased(),duplicate:true};
    }
    return {format:"karda.subscription-receipt.v1",id:row.id,deliveryRevision:receipt.revision,status:receipt.status,duplicate:true};
  }
  if(row.delivery_revision!==c.expectedDeliveryRevision)throw Error("subscription_conflict");
  if(c.action==="claim"||c.action==="redrive")await observeSubscription(db,row,windowRevision);
  else if(row.last_revision!==windowRevision)throw Error("subscription_revision_changed");
  if(c.action==="claim"){
    if(row.delivery_sequence!==row.sequence){
      row.delivery_sequence=row.sequence;row.delivery_attempt=0;row.delivery_status="ready";row.delivery_worker=null;row.retry_after=null;clearDeliveryLease(row);
    }
    if(row.ack_sequence===row.sequence){
      return {format:"karda.subscription-idle.v1",id:row.id,deliveryRevision:row.delivery_revision,sequence:row.sequence,ackSequence:row.ack_sequence,status:"idle"};
    }
    if(row.delivery_status==="leased"&&row.lease_until&&row.lease_until.getTime()>Date.now())throw Error("subscription_lease_busy");
    if(row.delivery_status==="dead"||(row.delivery_status==="retry"&&row.retry_after&&row.retry_after.getTime()>Date.now()))return response();
    if(row.delivery_attempt>=3){
      row.delivery_status="dead";row.retry_after=null;clearDeliveryLease(row);
      await deliveryEvent(db,row,requestId,fingerprint,"claim",null,"attempt_limit",windowRevision);return response();
    }
    row.delivery_attempt++;row.delivery_status="leased";row.delivery_worker=c.worker.trim();row.lease_id=randomUUID();row.lease_until=new Date(Date.now()+180000);row.retry_after=null;
    await deliveryEvent(db,row,requestId,fingerprint,"claim",null,null,windowRevision);return leased();
  }
  if(c.action==="redrive"){
    if(row.delivery_status!=="dead"&&row.delivery_status!=="retry")throw Error("subscription_conflict");
    row.delivery_sequence=row.sequence;row.delivery_attempt=0;row.delivery_status="ready";row.delivery_worker=null;row.retry_after=null;clearDeliveryLease(row);
    await deliveryEvent(db,row,requestId,fingerprint,"redrive",c.note,null,windowRevision);return response();
  }
  if(row.delivery_status!=="leased"||!row.lease_until||row.lease_until.getTime()<=Date.now()||row.lease_id!==c.leaseId||row.delivery_sequence!==row.sequence)throw Error("subscription_lease_changed");
  if(c.action==="complete"){
    if(c.sequence!==row.delivery_sequence||c.revision!==windowRevision)throw Error("subscription_revision_changed");
    if(row.ack_sequence>c.sequence)throw Error("subscription_conflict");
    row.ack_sequence=c.sequence;row.delivery_status="done";row.retry_after=null;clearDeliveryLease(row);
    await db.query("UPDATE karda_kb.knowledge_subscription SET ack_sequence=$2,delivery_status='done',lease_id=NULL,lease_until=NULL,retry_after=NULL WHERE id=$1",[row.id,row.ack_sequence]);
    await deliveryEvent(db,row,requestId,fingerprint,"complete",null,null,windowRevision);return response();
  }
  row.delivery_status=c.reason==="permanent"||row.delivery_attempt>=3?"dead":"retry";
  row.retry_after=row.delivery_status==="retry"?new Date(Date.now()+15000*2**(row.delivery_attempt-1)):null;clearDeliveryLease(row);
  await deliveryEvent(db,row,requestId,fingerprint,"fail",null,c.reason,windowRevision);return response();
}

import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import {requireKnowledgeRollout} from "./rollout-postgres";
import {PostgresSemanticReader,type SemanticReadIdentity,type KnowledgePackage} from "./read-postgres";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import type {ObjectStore} from "../storage/objectstore";
import {knowledgeSyncResult} from "./knowledge-sync";
import {profileHash} from "./profile-authority";
import {parseSubscription,subscriptionWindow,SUB_UUID,type SubscriptionCommand,type SubscriptionRow,type SubscriptionEvent} from "./subscription";

type Stored=SubscriptionRow&{request_hash:string;window:Record<string,unknown>};
export class PostgresSubscriptions{
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(who:SemanticReadIdentity)=>Promise<boolean>){}
  private async current(db:PoolClient,who:SemanticReadIdentity,window:Record<string,unknown>):Promise<KnowledgePackage>{
    const {input}=subscriptionWindow(window);
    // A subscription is an exact explicit scope, not permission to drop hidden libraries.
    const ids=input.kbIds??[input.kbId];
    const visible=(await db.query(`SELECT k.id FROM karda_kb.knowledge_base k JOIN karda_kb.kb_attachment a
      ON a.kb_id=k.id AND a.workspace_id=k.workspace_id WHERE k.id=ANY($1::uuid[]) AND k.workspace_id=$2 AND k.deleted_at IS NULL
      AND k.owner_type='user' AND (k.owner_sub=$3 OR k.publish_state IN ('ws_published','org_published')) AND a.user_sub=$3 AND a.product_code=$4`,
      [ids,who.workspaceId,who.sub,who.productCode])).rows;
    if(visible.length!==ids.length)throw Error("subscription_scope_changed");
    const loader=new PostgresFormalSemanticLoader(),reader=new PostgresSemanticReader(this.pool,this.objects,async()=>true,(client,kbs)=>loader.load(client,kbs));
    const pack=await reader.readPackage(who,ids,input.query,input.directory,false,db);
    if(pack.sourceStatus!=="complete")throw Error("subscription_source_unavailable");
    return pack;
  }
  async handle(who:SemanticReadIdentity,input:SubscriptionCommand){
    const command=parseSubscription(input);
    if(!SUB_UUID.test(who.workspaceId)||!/^usr_[a-f0-9-]{36}$/i.test(who.sub)||!/^[a-z][a-z0-9_-]{0,31}$/.test(who.productCode))throw Error("subscription_invalid_scope");
    if(await this.admit(who)!==true)throw Error("subscription_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${who.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:subscription:${who.workspaceId}:${who.sub}:${who.productCode}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("subscription_denied");}};
      const access=await readProductAccess(who,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read"))throw Error("subscription_denied");
      // Cancelling and listing metadata remains possible while consumption is paused.
      if(command.action!=="cancel"&&command.action!=="list")await requireKnowledgeRollout(db,who.workspaceId);
      const scope=[who.workspaceId,who.sub,who.productCode];
      if(command.action==="list"){
        const rows=(await db.query<SubscriptionRow>(`SELECT id,name,window_request AS "window",enabled,sequence,ack_sequence,last_revision,created_at,updated_at
          FROM karda_kb.knowledge_subscription WHERE workspace_id=$1 AND user_sub=$2 AND product_code=$3
          AND ($4::uuid IS NULL OR id<$4) ORDER BY id DESC LIMIT 21`,[...scope,command.before??null])).rows;
        await db.query("COMMIT");return {format:"karda.subscriptions.v1",subscriptions:rows.slice(0,20),nextBefore:rows.length>20?rows[19].id:null};
      }
      let row=(await db.query<Stored>(`SELECT *,window_request AS "window" FROM karda_kb.knowledge_subscription WHERE workspace_id=$1 AND user_sub=$2 AND product_code=$3 AND id=$4 FOR UPDATE`,[...scope,command.id])).rows[0];
      if(command.action==="create"){
        const hash=profileHash({name:command.name,window:command.window});
        if(row){if(row.request_hash!==hash)throw Error("subscription_conflict");}
        else{
          const count=Number((await db.query("SELECT count(*) FROM karda_kb.knowledge_subscription WHERE workspace_id=$1 AND user_sub=$2 AND product_code=$3 AND enabled",scope)).rows[0].count);
          if(count>=50)throw Error("subscription_limit");
          await this.current(db,who,command.window);
          await db.query(`INSERT INTO karda_kb.knowledge_subscription(id,workspace_id,user_sub,product_code,name,window_request,request_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[command.id,...scope,command.name,JSON.stringify(command.window),hash]);
        }
        await db.query("COMMIT");return {format:"karda.subscription-created.v1",id:command.id,duplicate:!!row};
      }
      if(!row)throw Error("subscription_not_found");
      if(command.action==="cancel"){
        await db.query("UPDATE karda_kb.knowledge_subscription SET enabled=false,updated_at=now() WHERE id=$1",[row.id]);
        await db.query("COMMIT");return {format:"karda.subscription-cancelled.v1",id:row.id};
      }
      if(!row.enabled)throw Error("subscription_cancelled");
      if(profileHash({name:row.name,window:row.window})!==row.request_hash)throw Error("subscription_corrupt");
      const knowledge=await this.current(db,who,row.window),sync=knowledgeSyncResult(who,subscriptionWindow(row.window),knowledge);
      if(command.action==="ack"){
        const observed=(await db.query<{revision:string}>("SELECT revision FROM karda_kb.knowledge_subscription_event WHERE subscription_id=$1 AND sequence=$2",[row.id,command.sequence])).rows[0];
        if(!observed||observed.revision!==command.revision||sync.revision!==command.revision)throw Error("subscription_revision_changed");
        if(row.ack_sequence===command.sequence){await db.query("COMMIT");return {format:"karda.subscription-ack.v1",id:row.id,ackSequence:row.ack_sequence,duplicate:true};}
        if(row.ack_sequence!==command.expectedAck||command.sequence<row.ack_sequence||command.sequence>row.sequence)throw Error("subscription_conflict");
        await db.query("UPDATE karda_kb.knowledge_subscription SET ack_sequence=$2,updated_at=now() WHERE id=$1",[row.id,command.sequence]);
        await db.query("COMMIT");return {format:"karda.subscription-ack.v1",id:row.id,ackSequence:command.sequence,duplicate:false};
      }
      if(row.last_revision!==sync.revision){
        if(row.sequence>=2147483646)throw Error("subscription_limit");
        row.sequence++;
        await db.query("INSERT INTO karda_kb.knowledge_subscription_event(subscription_id,sequence,revision) VALUES($1,$2,$3)",[row.id,row.sequence,sync.revision]);
        await db.query("UPDATE karda_kb.knowledge_subscription SET sequence=$2,last_revision=$3,updated_at=now() WHERE id=$1",[row.id,row.sequence,sync.revision]);
      }
      const after=command.after??row.ack_sequence;if(after>row.sequence)throw Error("subscription_invalid_request");
      const events=(await db.query<SubscriptionEvent>(`SELECT sequence,revision,observed_at AS "observedAt" FROM karda_kb.knowledge_subscription_event
        WHERE subscription_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 21`,[row.id,after])).rows;
      await db.query("COMMIT");
      return {format:"karda.subscription-delivery.v1",id:row.id,sequence:row.sequence,ackSequence:row.ack_sequence,revision:sync.revision,
        observedAt:sync.observedAt,reuse:"revalidate",action:"replace",knowledge,events:events.slice(0,20),nextAfter:events.length>20?events[19].sequence:null,
        replay:"revision_metadata_only",scope:"current_authorized_window"};
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}

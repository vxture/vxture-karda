import {Pool} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {ObjectStore} from "../storage/objectstore";
import {getObjectStore} from "../storage/objectstore";
import {localCompileProfile} from "./compile-profile";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {composeTopicDossier,topicDossierHash,type TopicDossier} from "./topic-dossier";

interface DossierRow {id:string;relation_type:string;input_hash:string;payload_hash:string;payload:TopicDossier;created_by:string;created_at:Date}
export class PostgresTopicDossiers {
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async handle(identity:SemanticReadIdentity,kbId:string,request:{action:"list"}|{action:"compose";id:string;relationType:string}){
    identity={...identity,roles:[...identity.roles]};request=structuredClone(request);
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if(!uuid.test(kbId)||!uuid.test(identity.workspaceId)||identity.productCode!=="karda"||
      (request.action==="compose"&&(!uuid.test(request.id)||!request.relationType.trim()||request.relationType.length>128)))throw new Error("semantic_topic_invalid");
    if(await this.admit(identity)!==true)throw new Error("semantic_topic_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw new Error("semantic_topic_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"service.publish")||!permits(access,"data.read"))throw new Error("semantic_topic_denied");
      const owner=await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL`,[kbId,identity.workspaceId,identity.sub]);
      if(owner.rowCount!==1)throw new Error("semantic_topic_denied");
      const profile=localCompileProfile(),loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
      // The nested reader uses this very transaction: no second authority/source snapshot.
      const reader=new PostgresSemanticReader(this.pool,this.objects,async()=>true,(client,ids)=>loader.load(client,ids));
      const pack=await reader.readPackage(identity,[kbId],{seedIds:["directory"],maxHops:1,maxNodes:500,maxEdges:1000},true,false,db);
      let savedId:string|null=null,duplicate=false;
      if(request.action==="compose"){
        const payload=composeTopicDossier(pack,request.relationType),payloadHash=topicDossierHash(payload);
        const existing=(await db.query<DossierRow>("SELECT * FROM karda_kb.topic_dossier WHERE kb_id=$1 AND (id=$2 OR (relation_type=$3 AND input_hash=$4))",[kbId,request.id,request.relationType,payload.inputHash])).rows;
        const prior=existing.find(r=>r.id===request.id);
        if(prior&&prior.payload_hash!==payloadHash)throw new Error("semantic_topic_conflict");
        if(existing.some(r=>r.payload_hash!==payloadHash||topicDossierHash(r.payload)!==r.payload_hash))throw new Error("semantic_topic_corrupt");
        if(existing.length){savedId=existing[0].id;duplicate=true;}
        else{
          savedId=request.id;
          await db.query(`INSERT INTO karda_kb.topic_dossier(id,kb_id,relation_type,input_hash,payload_hash,payload,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[request.id,kbId,request.relationType,payload.inputHash,payloadHash,payload,identity.sub]);
        }
      }
      const rows=(await db.query<DossierRow>("SELECT * FROM karda_kb.topic_dossier WHERE kb_id=$1 ORDER BY created_at DESC,id DESC LIMIT 21",[kbId])).rows;
      const more=rows.length>20;if(more)rows.pop();
      if(rows.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.payload)),0)>2*1024*1024)throw new Error("semantic_topic_budget");
      const items=rows.map(row=>{
        if(topicDossierHash(row.payload)!==row.payload_hash||row.payload.inputHash!==row.input_hash)throw new Error("semantic_topic_corrupt");
        let current:TopicDossier|null=null;
        try{const value=composeTopicDossier(pack,row.relation_type);if(value.inputHash===row.input_hash)current=value;}
        catch(error){if(!(error instanceof Error)||!["semantic_topic_empty","semantic_topic_incomplete"].includes(error.message))throw error;}
        // Stale history exposes identity only; source text always comes from today's authorized read.
        return {id:row.id,relationType:row.relation_type,inputHash:row.input_hash,createdAt:row.created_at.toISOString(),createdBy:row.created_by,
          state:current?"current_draft":"stale_draft",payload:current};
      });
      await db.query("COMMIT");return {items,more,savedId,duplicate,availableTypes:[...new Set(pack.edges.map(e=>e.type))].sort(),truncated:pack.truncated};
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}
export async function topicDossiers(identity:SemanticReadIdentity,kbId:string,request:Parameters<PostgresTopicDossiers["handle"]>[2],admit:()=>Promise<boolean>){
  if(!process.env.DATABASE_URL)throw new Error("semantic_topic_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresTopicDossiers(pool,getObjectStore(),admit).handle(identity,kbId,request);}finally{await pool.end();}
}

import {Pool} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {ObjectStore} from "../storage/objectstore";
import {getObjectStore} from "../storage/objectstore";
import {localCompileProfile} from "./compile-profile";
import {PostgresFormalSemanticLoader,semanticValueHash} from "./store-postgres";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {composeTopicDossier,topicDossierHash,type TopicDossier} from "./topic-dossier";
import {validateTopicSummary,type TopicSummary} from "./topic-summary";
import type {ModelSelection} from "../atlas/selection";

interface DossierRow {id:string;relation_type:string;input_hash:string;payload_hash:string;payload:TopicDossier;created_by:string;created_at:Date}
interface SummaryRow {id:string;dossier_id:string;input_hash:string;payload_hash:string;payload:TopicSummary;selection:ModelSelection;created_at:Date}
export type TopicRequest={action:"list";before?:string;dossierId?:string;summaryBefore?:string}|{action:"compose";id:string;relationType:string}|
  {action:"summary_prepare";id:string;dossierId:string}|{action:"summary_save";id:string;dossierId:string;payload:TopicSummary;selection:ModelSelection}|
  {action:"summary_review";id:string;dossierId:string;expectedRevision:number;decision:"accept"|"reject"|"revise";note:string};
export class PostgresTopicDossiers {
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async handle(identity:SemanticReadIdentity,kbId:string,request:TopicRequest){
    identity={...identity,roles:[...identity.roles]};request=structuredClone(request);
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if(!uuid.test(kbId)||!uuid.test(identity.workspaceId)||identity.productCode!=="karda"||
      (request.action!=="list"&&!uuid.test(request.id))||
      (request.action!=="list"&&request.action!=="compose"&&!uuid.test(request.dossierId))||
      (request.action==="compose"&&(!request.relationType.trim()||request.relationType.length>128)))throw new Error("semantic_topic_invalid");
    if(request.action==="summary_review"&&(!Number.isInteger(request.expectedRevision)||request.expectedRevision<0||request.expectedRevision>=2147483647||
      !["accept","reject","revise"].includes(request.decision)||!request.note.trim()||request.note.length>10000))throw new Error("semantic_topic_invalid");
    if(request.action==="list"&&((request.before!==undefined&&!uuid.test(request.before))||
      (request.dossierId!==undefined&&!uuid.test(request.dossierId))||(request.summaryBefore!==undefined&&!uuid.test(request.summaryBefore))||
      (request.before&&request.dossierId)||(request.summaryBefore&&!request.dossierId)))throw new Error("semantic_topic_invalid");
    if(await this.admit(identity)!==true)throw new Error("semantic_topic_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw new Error("semantic_topic_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"service.publish")||!permits(access,"data.read"))throw new Error("semantic_topic_denied");
      if((request.action==="summary_prepare"||request.action==="summary_save")&&!permits(access,"ai.use"))throw new Error("semantic_topic_denied");
      const owner=await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL`,[kbId,identity.workspaceId,identity.sub]);
      if(owner.rowCount!==1)throw new Error("semantic_topic_denied");
      const profile=localCompileProfile(),loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
      // The nested reader uses this very transaction: no second authority/source snapshot.
      const reader=new PostgresSemanticReader(this.pool,this.objects,async()=>true,(client,ids)=>loader.load(client,ids));
      const pack=await reader.readPackage(identity,[kbId],{seedIds:["directory"],maxHops:1,maxNodes:500,maxEdges:1000},true,false,db);
      let savedId:string|null=null,duplicate=false;
      let modelInput:TopicDossier|null=null;
      if(request.action!=="list"&&request.action!=="compose"){
        const draft=(await db.query<DossierRow>("SELECT * FROM karda_kb.topic_dossier WHERE kb_id=$1 AND id=$2",[kbId,request.dossierId])).rows[0];
        if(!draft||topicDossierHash(draft.payload)!==draft.payload_hash)throw new Error("semantic_topic_conflict");
        const current=composeTopicDossier(pack,draft.relation_type);
        if(current.inputHash!==draft.input_hash)throw new Error("semantic_topic_conflict");
        const prior=(await db.query<SummaryRow>("SELECT * FROM karda_kb.topic_summary WHERE kb_id=$1 AND id=$2",[kbId,request.id])).rows[0];
        if(prior&&(prior.dossier_id!==draft.id||prior.input_hash!==current.inputHash||semanticValueHash(prior.payload)!==prior.payload_hash))throw new Error("semantic_topic_conflict");
        if(request.action==="summary_prepare"){if(!prior)modelInput=current;else duplicate=true;}
        if(request.action==="summary_save"){
          const payload=validateTopicSummary({paragraphs:request.payload.paragraphs},current);
          if(request.payload.inputHash!==current.inputHash||request.payload.format!==payload.format)throw new Error("semantic_topic_conflict");
          const selector=request.selection;
          if(Object.keys(selector).length!==1||!Object.keys(selector).every(k=>["modelCode","endpointCode"].includes(k))||
            Object.values(selector).some(v=>typeof v!=="string"||!v.trim()||v.length>128))throw new Error("semantic_topic_invalid");
          const fingerprint=semanticValueHash(payload);
          if(prior){if(prior.payload_hash!==fingerprint)throw new Error("semantic_topic_conflict");duplicate=true;}
          else await db.query(`INSERT INTO karda_kb.topic_summary(id,kb_id,dossier_id,input_hash,payload_hash,payload,selection,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[request.id,kbId,draft.id,current.inputHash,fingerprint,payload,selector,identity.sub]);
        }
        if(request.action==="summary_review"){
          if(!prior)throw new Error("semantic_topic_conflict");
          const subject=`topic-summary/${request.id}`;
          const latest=(await db.query<{revision:number;decision:string;note:string;subject_hash:string}>("SELECT revision,decision,note,subject_hash FROM karda_kb.semantic_review WHERE kb_id=$1 AND subject_key=$2 ORDER BY revision DESC LIMIT 1",[kbId,subject])).rows[0];
          if((latest?.revision??0)!==request.expectedRevision){
            if(latest?.revision===request.expectedRevision+1&&latest.decision===request.decision&&latest.note===request.note&&latest.subject_hash===prior.payload_hash)duplicate=true;
            else throw new Error("semantic_topic_conflict");
          }else await db.query(`INSERT INTO karda_kb.semantic_review(kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
            VALUES($1,$2,$3,$4,$5,$6,$7)`,[kbId,subject,request.expectedRevision+1,request.decision,prior.payload_hash,identity.sub,request.note]);
        }
      }
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
      const focusedId="dossierId" in request?request.dossierId:request.action==="compose"?savedId:undefined;
      const before=request.action==="list"?request.before:undefined,summaryBefore=request.action==="list"?request.summaryBefore:undefined;
      // Resolve cursor anchors only inside this currently authorized library.
      if(before&&(await db.query("SELECT id FROM karda_kb.topic_dossier WHERE kb_id=$1 AND id=$2",[kbId,before])).rowCount!==1)throw new Error("semantic_topic_conflict");
      if(summaryBefore&&(await db.query("SELECT id FROM karda_kb.topic_summary WHERE kb_id=$1 AND dossier_id=$2 AND id=$3",[kbId,focusedId,summaryBefore])).rowCount!==1)throw new Error("semantic_topic_conflict");
      const rows=(await db.query<DossierRow>(`SELECT * FROM karda_kb.topic_dossier WHERE kb_id=$1
        AND ($2::uuid IS NULL OR id=$2) AND ($3::uuid IS NULL OR (created_at,id)<
          (SELECT created_at,id FROM karda_kb.topic_dossier WHERE kb_id=$1 AND id=$3))
        ORDER BY created_at DESC,id DESC LIMIT 21`,[kbId,focusedId??null,before??null])).rows;
      if(focusedId&&!rows.length)throw new Error("semantic_topic_conflict");
      const more=rows.length>20;if(more)rows.pop();
      if(rows.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.payload)),0)>2*1024*1024)throw new Error("semantic_topic_budget");
      const summaryLimit=focusedId?20:5;
      const selectedSummary=request.action!=="list"&&request.action!=="compose"?request.id:null;
      const summaryRows=(await db.query<SummaryRow>(`SELECT s.* FROM unnest($2::uuid[]) AS d(id)
        CROSS JOIN LATERAL (SELECT * FROM karda_kb.topic_summary WHERE kb_id=$1 AND dossier_id=d.id
          AND ($5::uuid IS NULL OR id=$5)
          AND ($3::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM karda_kb.topic_summary WHERE kb_id=$1 AND dossier_id=d.id AND id=$3))
          ORDER BY created_at DESC,id DESC LIMIT $4) s ORDER BY s.created_at DESC,s.id DESC`,[kbId,rows.map(r=>r.id),summaryBefore??null,summaryLimit+1,selectedSummary])).rows;
      const summaries=rows.flatMap(d=>summaryRows.filter(s=>s.dossier_id===d.id).slice(0,summaryLimit));
      if(summaries.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.payload)),0)>2*1024*1024)throw new Error("semantic_topic_budget");
      const reviews=(await db.query<{subject_key:string;revision:number;decision:string;note:string;subject_hash:string;reviewer_sub:string}>(`SELECT DISTINCT ON(subject_key) subject_key,revision,decision,note,subject_hash,reviewer_sub
        FROM karda_kb.semantic_review WHERE kb_id=$1 AND subject_key=ANY($2::text[]) ORDER BY subject_key,revision DESC`,[kbId,summaries.map(s=>`topic-summary/${s.id}`)])).rows;
      const items=rows.map(row=>{
        if(topicDossierHash(row.payload)!==row.payload_hash||row.payload.inputHash!==row.input_hash)throw new Error("semantic_topic_corrupt");
        let current:TopicDossier|null=null;
        try{const value=composeTopicDossier(pack,row.relation_type);if(value.inputHash===row.input_hash)current=value;}
        catch(error){if(!(error instanceof Error)||!["semantic_topic_empty","semantic_topic_incomplete"].includes(error.message))throw error;}
        // Stale history exposes identity only; source text always comes from today's authorized read.
        return {id:row.id,relationType:row.relation_type,inputHash:row.input_hash,createdAt:row.created_at.toISOString(),createdBy:row.created_by,
          state:current?"current_draft":"stale_draft",payload:current,
          summaryNext:summaryRows.filter(s=>s.dossier_id===row.id).length>summaryLimit?summaries.filter(s=>s.dossier_id===row.id).at(-1)!.id:null,
          summaries:summaries.filter(s=>s.dossier_id===row.id).map(s=>{
            if(semanticValueHash(s.payload)!==s.payload_hash)throw new Error("semantic_topic_corrupt");
            const review=reviews.find(r=>r.subject_key===`topic-summary/${s.id}`);
            if(review&&review.subject_hash!==s.payload_hash)throw new Error("semantic_topic_corrupt");
            const active=Boolean(current&&s.input_hash===current.inputHash);
            if(active)validateTopicSummary({paragraphs:s.payload.paragraphs},current!);
            return {id:s.id,state:active?(review?.decision??"pending"):"stale",revision:review?.revision??0,note:active?review?.note??null:null,
              payload:active?s.payload:null,selection:s.selection};
          })};
      });
      await db.query("COMMIT");return {items,more,nextCursor:more?rows.at(-1)!.id:null,focusedId:focusedId??null,savedId,duplicate,modelInput,availableTypes:[...new Set(pack.edges.map(e=>e.type))].sort(),truncated:pack.truncated};
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}
export async function topicDossiers(identity:SemanticReadIdentity,kbId:string,request:Parameters<PostgresTopicDossiers["handle"]>[2],admit:()=>Promise<boolean>){
  if(!process.env.DATABASE_URL)throw new Error("semantic_topic_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresTopicDossiers(pool,getObjectStore(),admit).handle(identity,kbId,request);}finally{await pool.end();}
}

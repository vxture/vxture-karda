import {Pool} from "pg";
import type {ObjectStore} from "../storage/objectstore";
import {getObjectStore} from "../storage/objectstore";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {PostgresFormalSemanticLoader,semanticValueHash} from "./store-postgres";
import {localCompileProfile} from "./compile-profile";
import {composeTopicDossier,topicDossierHash,type TopicDossier} from "./topic-dossier";
import {validateTopicSummary,type TopicSummary} from "./topic-summary";

export interface TopicKnowledgeRequest {kbId:string;action:"list"|"read";relationType?:string;summaryId?:string;before?:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseTopicKnowledge(value:unknown):TopicKnowledgeRequest{
  const bad=():never=>{throw Error("topic_knowledge_invalid");};
  if(!value||typeof value!=="object"||Array.isArray(value))return bad();const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!["kb_id","action","relation_type","summary_id","before"].includes(k))||typeof v.kb_id!=="string"||!uuid.test(v.kb_id)||
    !["list","read"].includes(v.action as string))return bad();
  if(v.action==="list"&&["relation_type","summary_id","before"].some(k=>Object.hasOwn(v,k)))return bad();
  if(v.action==="read"&&(typeof v.relation_type!=="string"||!v.relation_type.trim()||v.relation_type.length>128))return bad();
  for(const key of ["summary_id","before"])if(Object.hasOwn(v,key)&&(typeof v[key]!=="string"||!uuid.test(v[key] as string)))return bad();
  if(v.summary_id&&v.before)return bad();
  return {kbId:v.kb_id,action:v.action as "list"|"read",...(v.relation_type?{relationType:v.relation_type as string}:{}),
    ...(v.summary_id?{summaryId:v.summary_id as string}:{}),...(v.before?{before:v.before as string}:{})};
}
export interface TopicKnowledgeResult {
  format:"karda.topic-knowledge.v1";checkedAt:string;kbId:string;
  topics:{relationType:string;relations:number;entities:number}[];
  dossier:TopicDossier|null;
  summaries:{id:string;revision:number;createdAt:string}[];
  summary:{id:string;revision:number;state:"human_accepted";payload:TopicSummary}|null;
  nextBefore:string|null;gaps:string[];
}

/** Consumer read only: current published facts and separately human-accepted summary. */
export class PostgresTopicKnowledge {
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async read(identity:SemanticReadIdentity,input:TopicKnowledgeRequest):Promise<TopicKnowledgeResult>{
    identity={...identity,roles:[...identity.roles]};input=structuredClone(input);
    // Revalidate internal callers using the same wire contract.
    input=parseTopicKnowledge({kb_id:input.kbId,action:input.action,...(input.relationType!==undefined?{relation_type:input.relationType}:{}),
      ...(input.summaryId!==undefined?{summary_id:input.summaryId}:{}),...(input.before!==undefined?{before:input.before}:{})});
    if(await this.admit(identity)!==true)throw Error("semantic_read_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const profile=localCompileProfile(),loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
      const reader=new PostgresSemanticReader(this.pool,this.objects,async()=>true,(client,ids)=>loader.load(client,ids));
      const pack=await reader.readPackage(identity,[input.kbId],{seedIds:["directory"],maxHops:1,maxNodes:500,maxEdges:1000},true,false,db);
      if(pack.truncated||pack.sourceStatus!=="complete")throw Error("topic_knowledge_incomplete");
      const topics=[...new Set(pack.edges.map(e=>e.type))].sort().map(relationType=>{const edges=pack.edges.filter(e=>e.type===relationType);
        return {relationType,relations:edges.length,entities:new Set(edges.flatMap(e=>[e.sourceId,e.targetId])).size};});
      const checkedAt=(await db.query<{now:Date}>("SELECT statement_timestamp() AS now")).rows[0].now.toISOString();
      const result:TopicKnowledgeResult={format:"karda.topic-knowledge.v1",checkedAt,kbId:input.kbId,topics,dossier:null,summaries:[],summary:null,nextBefore:null,gaps:[]};
      if(input.action==="read"&&topics.some(t=>t.relationType===input.relationType)){
        const current=composeTopicDossier(pack,input.relationType!);result.dossier=current;
        // Match only a currently reproducible compilation; old/pending drafts cannot leak identities.
        const draft=(await db.query<{id:string;payload:TopicDossier;payload_hash:string}>("SELECT id,payload,payload_hash FROM karda_kb.topic_dossier WHERE kb_id=$1 AND relation_type=$2 AND input_hash=$3",[input.kbId,input.relationType,current.inputHash])).rows[0];
        if(draft){
          if(topicDossierHash(draft.payload)!==draft.payload_hash||draft.payload.inputHash!==current.inputHash||topicDossierHash(current)!==draft.payload_hash)throw Error("topic_knowledge_corrupt");
          const approved=`FROM karda_kb.topic_summary s JOIN LATERAL (SELECT revision,decision,subject_hash FROM karda_kb.semantic_review
            WHERE kb_id=s.kb_id AND subject_key='topic-summary/'||s.id ORDER BY revision DESC LIMIT 1) v ON true
            WHERE s.kb_id=$1 AND s.dossier_id=$2 AND s.input_hash=$3 AND v.decision='accept' AND v.subject_hash=s.payload_hash`;
          if(input.before&&(await db.query(`SELECT s.id ${approved} AND s.id=$4`,[input.kbId,draft.id,current.inputHash,input.before])).rowCount!==1)throw Error("topic_knowledge_changed");
          const rows=(await db.query<{id:string;revision:number;created_at:Date;payload:TopicSummary;payload_hash:string}>(`SELECT s.id,v.revision,s.created_at,s.payload,s.payload_hash ${approved}
            AND ($4::uuid IS NULL OR s.id=$4) AND ($5::uuid IS NULL OR (s.created_at,s.id)<(SELECT created_at,id FROM karda_kb.topic_summary WHERE kb_id=$1 AND dossier_id=$2 AND id=$5))
            ORDER BY s.created_at DESC,s.id DESC LIMIT 21`,[input.kbId,draft.id,current.inputHash,input.summaryId??null,input.before??null])).rows;
          const more=rows.length>20;if(more)rows.pop();
          if(rows.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.payload)),0)>2*1024*1024)throw Error("topic_knowledge_budget");
          for(const row of rows){if(semanticValueHash(row.payload)!==row.payload_hash||row.payload.format!=="karda.topic-summary.v1"||row.payload.inputHash!==current.inputHash)throw Error("topic_knowledge_corrupt");
            validateTopicSummary({paragraphs:row.payload.paragraphs},current);}
          result.summaries=rows.map(r=>({id:r.id,revision:r.revision,createdAt:r.created_at.toISOString()}));
          if(rows[0])result.summary={id:rows[0].id,revision:rows[0].revision,state:"human_accepted",payload:rows[0].payload};
          result.nextBefore=more?rows.at(-1)!.id:null;
        }
        if(!result.summary)result.gaps.push("no_current_accepted_summary");
      }else if(input.action==="read")result.gaps.push("no_current_topic");
      if(!topics.length)result.gaps.push("no_published_support");
      if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)throw Error("topic_knowledge_budget");
      await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}
export async function readTopicKnowledge(identity:SemanticReadIdentity,input:TopicKnowledgeRequest,admit:()=>Promise<boolean>){
  if(!process.env.DATABASE_URL)throw Error("topic_knowledge_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresTopicKnowledge(pool,getObjectStore(),admit).read(identity,input);}finally{await pool.end();}
}

import {createHash} from "node:crypto";
import {parsePackageRequest,readKnowledgePackage,type PackageRequest} from "./knowledge-package";
import type {KnowledgePackage,SemanticReadIdentity} from "./read-postgres";

export interface KnowledgeSyncRequest {input:PackageRequest;knownRevision?:string}
export type KnowledgeSyncResult={format:"karda.knowledge-sync.v1";revision:string;observedAt:string;reuse:"revalidate"}&(
  {action:"unchanged";knowledge:null}|{action:"replace";knowledge:KnowledgePackage});

export function parseKnowledgeSync(value:unknown):KnowledgeSyncRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("semantic_invalid_sync_request");
  const {known_revision,...request}=value as Record<string,unknown>;
  if(Object.hasOwn(value,"known_revision")&&(typeof known_revision!=="string"||!/^[a-f0-9]{64}$/.test(known_revision)))
    throw new Error("semantic_invalid_sync_request");
  try{return {input:parsePackageRequest(request),...(known_revision!==undefined?{knownRevision:known_revision as string}:{})};}
  catch{throw new Error("semantic_invalid_sync_request");}
}

/** Canonical object keys; array order remains meaningful (including passages). */
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}

/** Revisions identify one current authorized request window, never a grant or lease. */
export function knowledgeSyncResult(identity:SemanticReadIdentity,request:KnowledgeSyncRequest,knowledge:KnowledgePackage,observedAt=new Date().toISOString()):KnowledgeSyncResult{
  const input=request.input,scope={workspace:identity.workspaceId,sub:identity.sub,product:identity.productCode,
    kbIds:[...new Set(input.kbIds??[input.kbId])].sort(),directory:input.directory,
    query:{...input.query,seedIds:[...new Set(input.query.seedIds)].sort(),relationTypes:input.query.relationTypes?[...new Set(input.query.relationTypes)].sort():undefined}};
  const body=JSON.stringify(canonical(["karda.knowledge-sync.v1",scope,knowledge]));
  if(Buffer.byteLength(body,"utf8")>2*1024*1024)throw new Error("semantic_sync_budget");
  const revision=createHash("sha256").update(body).digest("hex");
  const base={format:"karda.knowledge-sync.v1" as const,revision,observedAt,reuse:"revalidate" as const};
  return revision===request.knownRevision?{...base,action:"unchanged",knowledge:null}:{...base,action:"replace",knowledge};
}

/** Always read current authority/source state, including on a matching revision. */
export async function readKnowledgeSync(identity:SemanticReadIdentity,request:KnowledgeSyncRequest,admit:()=>Promise<boolean>,read=readKnowledgePackage):Promise<KnowledgeSyncResult>{
  identity={...identity,roles:[...identity.roles]};request=structuredClone(request);
  const knowledge=await read(identity,request.input,admit);
  return knowledgeSyncResult(identity,request,knowledge);
}

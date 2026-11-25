import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import {localCompileProfile} from "./compile-profile";
import type {NeighborhoodQuery} from "./contracts";
import {validateNeighborhoodQuery} from "./projection";

export interface PackageRequest {kbId:string;kbIds?:string[];query:NeighborhoodQuery;directory:boolean}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parsePackageRequest(value:unknown):PackageRequest {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("semantic_invalid_package_request");
  const v=value as Record<string,unknown>;
  const single=typeof v.kb_id==="string"&&uuid.test(v.kb_id),multi=Array.isArray(v.kb_ids)&&v.kb_ids.length>0&&v.kb_ids.length<=20&&v.kb_ids.every(id=>typeof id==="string"&&uuid.test(id));
  if(Object.keys(v).some(k=>!["kb_id","kb_ids","entity_ids","relation_types","max_hops","max_nodes","max_edges","page_cursor"].includes(k))||
    (Object.hasOwn(v,"kb_id")===Object.hasOwn(v,"kb_ids"))||(!single&&!multi)||!Array.isArray(v.entity_ids)||v.entity_ids.some(id=>typeof id!=="string"||!uuid.test(id))||
    (v.relation_types!==undefined&&(!Array.isArray(v.relation_types)||v.relation_types.some(t=>typeof t!=="string"||t.length>128))))
    throw new Error("semantic_invalid_package_request");
  const directory=v.entity_ids.length===0;
  if(Object.hasOwn(v,"page_cursor")&&(!directory||typeof v.page_cursor!=="string"))throw new Error("semantic_invalid_package_request");
  const query:NeighborhoodQuery={seedIds:directory?["directory"]:[...v.entity_ids] as string[],maxHops:(v.max_hops??1) as number,
    maxNodes:(v.max_nodes??50) as number,maxEdges:(v.max_edges??100) as number,
    ...(v.page_cursor!==undefined?{pageCursor:v.page_cursor as string}:{}),
    ...(v.relation_types?{relationTypes:[...v.relation_types as string[]]}:{})};
  try{validateNeighborhoodQuery(query);}catch{throw new Error("semantic_invalid_package_request");}
  const kbIds=single?[v.kb_id as string]:[...new Set(v.kb_ids as string[])];
  return {kbId:kbIds[0],...(single?{}:{kbIds}),query,directory};
}

/** Shared by RP knowledge pages and authenticated OBO tools. No model or draft reads. */
export async function readKnowledgePackage(identity:SemanticReadIdentity,input:PackageRequest,admit:()=>Promise<boolean>,exporting=false) {
  if(!process.env.DATABASE_URL)throw new Error("semantic_store_unavailable");
  const profile=localCompileProfile();
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{
    const loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
    const reader=new PostgresSemanticReader(pool,getObjectStore(),admit,(db,ids)=>loader.load(db,ids));
    return await reader.readPackage(identity,input.kbIds??[input.kbId],input.query,input.directory,exporting);
  }finally{await pool.end();}
}

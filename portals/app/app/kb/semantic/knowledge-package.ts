import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import {localCompileProfile} from "./compile-profile";
import type {NeighborhoodQuery} from "./contracts";
import {validateNeighborhoodQuery} from "./projection";

export interface PackageRequest {kbId:string;query:NeighborhoodQuery;directory:boolean}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parsePackageRequest(value:unknown):PackageRequest {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("semantic_invalid_package_request");
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!["kb_id","entity_ids","relation_types","max_hops","max_nodes","max_edges"].includes(k))||
    typeof v.kb_id!=="string"||!uuid.test(v.kb_id)||!Array.isArray(v.entity_ids)||v.entity_ids.some(id=>typeof id!=="string"||!uuid.test(id))||
    (v.relation_types!==undefined&&(!Array.isArray(v.relation_types)||v.relation_types.some(t=>typeof t!=="string"||t.length>128))))
    throw new Error("semantic_invalid_package_request");
  const directory=v.entity_ids.length===0;
  const query:NeighborhoodQuery={seedIds:directory?["directory"]:[...v.entity_ids] as string[],maxHops:(v.max_hops??1) as number,
    maxNodes:(v.max_nodes??50) as number,maxEdges:(v.max_edges??100) as number,
    ...(v.relation_types?{relationTypes:[...v.relation_types as string[]]}:{})};
  try{validateNeighborhoodQuery(query);}catch{throw new Error("semantic_invalid_package_request");}
  return {kbId:v.kb_id,query,directory};
}

/** Shared by RP knowledge pages and authenticated OBO tools. No model or draft reads. */
export async function readKnowledgePackage(identity:SemanticReadIdentity,input:PackageRequest,admit:()=>Promise<boolean>) {
  if(!process.env.DATABASE_URL)throw new Error("semantic_store_unavailable");
  const profile=localCompileProfile();
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{
    const loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
    const reader=new PostgresSemanticReader(pool,getObjectStore(),admit,(db,ids)=>loader.load(db,ids));
    return await reader.readPackage(identity,[input.kbId],input.query,input.directory);
  }finally{await pool.end();}
}

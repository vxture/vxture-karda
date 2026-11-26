import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import {validatePublishedSearch,type PublishedSearchRequest} from "./published-search";

export async function readPublishedSearch(identity:SemanticReadIdentity,input:PublishedSearchRequest,admit:()=>Promise<boolean>){
  if(!process.env.DATABASE_URL)throw new Error("semantic_store_unavailable");
  input=structuredClone(input);validatePublishedSearch(input);
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{
    const loader=new PostgresFormalSemanticLoader();
    const reader=new PostgresSemanticReader(pool,getObjectStore(),admit,(db,ids)=>loader.load(db,ids));
    const knowledge=await reader.readPackage(identity,input.kbIds,{seedIds:["directory"],maxHops:0,maxNodes:40,maxEdges:20,relationTypes:input.relationTypes},true,false,undefined,input);
    return {format:"karda.published-search.v1" as const,mode:"published_facts" as const,knowledge};
  }finally{await pool.end();}
}

import {spawn} from "node:child_process";
import type {GraphProjection,OntologySchema} from "./contracts";
import {projectRdf,resource,type RdfProjection} from "./rdf-projection";
export interface JenaResult {format:"karda.jena-result.v1";engine:"apache-jena";version:"6.3.0";conforms:boolean;issues:{focus:string;path:string;message:string}[];issuesTruncated:boolean;edgeIds?:string[];truncated?:boolean}
let active=0;
const MAX_BYTES=2*1024*1024;
/** A local fixed executable, no shell/server/network and no caller query language.
 * Each process receives only a freshly authorized projection and exits after one request. */
export async function executeJena(rdf:RdfProjection,query?:{kbId:string;seedId:string;hops:number}):Promise<JenaResult>{
  const jar=process.env.KARDA_JENA_JAR;
  if(!jar||!jar.endsWith(".jar"))throw new Error("semantic_jena_unavailable");
  if(query&&(!Number.isInteger(query.hops)||query.hops<1||query.hops>4))throw new Error("semantic_jena_invalid_query");
  const body=JSON.stringify({operation:query?"neighbors":"validate",data:rdf.data,shapes:rdf.shapes,
    ...(query?{seed:resource("entity",query.kbId,query.seedId),hops:query.hops}:{})});
  if(Buffer.byteLength(body)>MAX_BYTES)throw new Error("semantic_rdf_budget");
  if(active>=2)throw new Error("semantic_jena_busy");
  active++;
  try{return await new Promise<JenaResult>((resolve,reject)=>{
    const child=spawn(process.env.KARDA_JAVA_BINARY||"java",["-Xms16m","-Xmx192m","-Dorg.slf4j.simpleLogger.defaultLogLevel=off","-jar",jar],
      {windowsHide:true,shell:false,stdio:["pipe","pipe","pipe"]});
    let done=false,size=0;const chunks:Buffer[]=[];
    const finish=(error?:Error,value?:JenaResult)=>{if(done)return;done=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(value!);};
    const timer=setTimeout(()=>finish(new Error("semantic_jena_timeout")),20000);
    child.on("error",()=>finish(new Error("semantic_jena_unavailable")));
    child.stdin.on("error",()=>finish(new Error("semantic_jena_execution_failed")));
    child.stdout.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_BYTES)finish(new Error("semantic_jena_response_budget"));else chunks.push(chunk);});
    // Drain but never retain/log Jena parser errors or RDF content.
    child.stderr.on("data",()=>{});
    child.on("close",code=>{
      if(done)return;
      if(code!==0)return finish(new Error("semantic_jena_execution_failed"));
      try{
        const value=JSON.parse(Buffer.concat(chunks).toString("utf8")) as JenaResult;
        if(value.format!=="karda.jena-result.v1"||value.engine!=="apache-jena"||value.version!=="6.3.0"||typeof value.conforms!=="boolean"||
          !Array.isArray(value.issues)||value.issues.length>100||typeof value.issuesTruncated!=="boolean"||
          (query&&(!Array.isArray(value.edgeIds)||value.edgeIds.length>1000||!value.edgeIds.every(id=>typeof id==="string"&&/^urn:karda:relation:[a-f0-9-]{36}:[a-f0-9-]{36}$/.test(id)))))
          throw new Error("semantic_jena_invalid_response");
        finish(undefined,value);
      }catch{finish(new Error("semantic_jena_invalid_response"));}
    });
    child.stdin.end(body,"utf8");
  });}finally{active--;}
}
/** Existing source/authority checks remain authoritative. Jena adds a standards
 * gate over their result. It cannot validate a stale release into current access. */
export async function validateCurrentGraph(graph:GraphProjection,schema:OntologySchema):Promise<{engine:"apache-jena";version:"6.3.0";fingerprint:string}|undefined>{
  if(!process.env.KARDA_JENA_JAR){
    if(process.env.DEPLOY_STAGE==="production")throw new Error("semantic_jena_unavailable");
    return undefined;
  }
  const rdf=projectRdf(graph,schema),report=await executeJena(rdf);
  if(!report.conforms)throw new Error("semantic_shacl_invalid");
  return{engine:report.engine,version:report.version,fingerprint:rdf.fingerprint};
}

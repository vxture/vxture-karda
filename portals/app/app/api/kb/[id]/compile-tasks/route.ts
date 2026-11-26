import { Pool } from "pg";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../kb/api/http";
import { getOidcConfig } from "../../../../auth/lib/config";
import { userAdmission } from "../../../../platform/admission";
import { getObjectStore } from "../../../../kb/storage/objectstore";
import { PostgresSemanticStore } from "../../../../kb/semantic/store-postgres";
import { reviewOriginAllowed } from "../../../../kb/semantic/review-request";
import { executeCompileTask,parseCompileTaskRequest } from "../../../../kb/semantic/compile-task";
import { AtlasSemanticCandidateClient } from "../../../../kb/semantic/compiler";
import { getGenerationClient } from "../../../../kb/retrieval/generation";
import { tenantForWorkspace } from "../../../../kb/processing/atlas-embedder";
import {parseCompileTaskQuery} from "../../../../kb/semantic/task-query";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,ctx:{params:Promise<{id:string}>}) {
  let pool:Pool|undefined;
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))
      return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("service.publish");if(!auth.ok)return auth.response;
    if(!process.env.DATABASE_URL)throw new Error("semantic_store_unavailable");
    const {id}=await ctx.params,identity={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    const objects=getObjectStore();
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const store=new PostgresSemanticStore(pool,objects,async()=> (await userAdmission(auth.user)).allowed);
    if(req.method==="GET")return NextResponse.json(await store.browseCompileTasks(identity,id,parseCompileTaskQuery(new URL(req.url).searchParams)),{headers});
    if(new URL(req.url).searchParams.size)throw new Error("semantic_invalid_task_request");
    const body=parseCompileTaskRequest(await req.text());
    const result=body.action==="create"?await store.createCompileTask(identity,id,body.taskId,body.documentIds):
      body.action==="resolve"?await store.resolveCompileTask(identity,id,body):
      await executeCompileTask(identity,id,body.taskId,{store,tenantForWorkspace,candidates:()=>{
        const generation=getGenerationClient();return generation?new AtlasSemanticCandidateClient(generation):null;
      }});
    return NextResponse.json(result,{headers});
  }catch(error){
    const raw=error instanceof Error?error.message:"",known=/^semantic_[a-z_]+$/.test(raw);
    const status=!known?503:/denied/.test(raw)?403:/stale|conflict|changed|required/.test(raw)?409:/unavailable/.test(raw)?503:400;
    return NextResponse.json({error:known?raw:"semantic_compile_unavailable"},{status,headers});
  }finally{await pool?.end();}
}
export const GET=handle;
export const POST=handle;

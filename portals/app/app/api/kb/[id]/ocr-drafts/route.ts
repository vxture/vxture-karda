import {Pool} from "pg";
import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {getOidcConfig} from "../../../../auth/lib/config";
import {userAdmission} from "../../../../platform/admission";
import {getObjectStore} from "../../../../kb/storage/objectstore";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {PostgresOcrStore,parseOcrCommand} from "../../../../kb/processing/ocr-store";
import {recognizePdf} from "../../../../kb/processing/pdf-ocr";
import {tenantForWorkspace} from "../../../../kb/processing/atlas-embedder";
import {getAtlasCore} from "../../../../kb/atlas/wiring";
import {AtlasApiError} from "../../../../kb/atlas/client";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
  let pool:Pool|undefined;
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))
      return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
    if(!process.env.DATABASE_URL)throw Error("ocr_store_unavailable");
    const {id}=await ctx.params,identity={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const store=new PostgresOcrStore(pool,getObjectStore(),async()=>(await userAdmission(auth.user)).allowed);
    const params=new URL(req.url).searchParams;
    if(req.method==="GET"){
      if([...params.keys()].some(k=>!["document_id","draft_id","before"].includes(k))||[...params.keys()].some(k=>params.getAll(k).length!==1))throw Error("ocr_invalid_request");
      return NextResponse.json(await store.browse(identity,id,params.get("document_id")??"",params.get("draft_id")??undefined,params.get("before")??undefined),{headers});
    }
    if(params.size)throw Error("ocr_invalid_request");
    const command=parseOcrCommand(await req.text());
    if(command.action!=="create")return NextResponse.json(await store.decide(identity,id,command),{headers});
    const core=getAtlasCore(),tenant=await tenantForWorkspace(identity.workspaceId);
    if(!core||!tenant)throw Error("ocr_atlas_unavailable");
    const claim=await store.claim(identity,id,command);
    if(claim.claimed){
      try{
        const payload=await recognizePdf(core,{ws:identity.workspaceId,org:tenant},`karda:ocr:${command.id}`,command.modelCode,claim.bytes!);
        await store.settle(identity,id,command,payload,null);
      }catch(error){
        const code=error instanceof AtlasApiError?error.code==="QUOTA_EXCEEDED"?"ocr_quota_exceeded":error.retryable?"ocr_atlas_retryable":"ocr_atlas_refused":
          error instanceof Error&&/^ocr_[a-z_]+$/.test(error.message)?error.message:"ocr_unavailable";
        // Permission/source changes can also prevent recording the failure.
        await store.settle(identity,id,command,null,code).catch(()=>{});
        throw Error(code);
      }
    }
    return NextResponse.json(await store.browse(identity,id,command.documentId,command.id),{headers});
  }catch(error){
    const raw=error instanceof Error?error.message:"",code=/^ocr_[a-z_]+$/.test(raw)?raw:error instanceof SyntaxError?"ocr_invalid_request":"ocr_unavailable";
    const status=/denied/.test(code)?403:/conflict|changed|not_ready/.test(code)?409:/unavailable|retryable|busy/.test(code)?503:400;
    return NextResponse.json({error:code},{status,headers});
  }finally{await pool?.end();}
}
export const GET=handle;
export const POST=handle;

import {NextResponse} from "next/server";
import {requireAuth} from "../../../kb/api/http";
import {userAdmission} from "../../../platform/admission";
import {getOidcConfig} from "../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../kb/semantic/review-request";
import {rebuildService,rebuildFailure} from "../../../kb/processing/rebuild-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request){
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
    const p=new URL(req.url).searchParams;
    if([...p.keys()].some(k=>!["kbId","id","before"].includes(k))||[...p.keys()].some(k=>p.getAll(k).length>1)||(req.method==="POST"&&p.size))throw Error("rebuild_invalid_request");
    let body:unknown;
    if(req.method==="POST"){
      const text=await req.text();if(text.length>16384)throw Error("rebuild_invalid_request");
      try{body=JSON.parse(text);}catch{throw Error("rebuild_invalid_request");}
    }
    const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    return NextResponse.json(await rebuildService(who,body,async()=>(await userAdmission(auth.user)).allowed,
      req.method==="GET"?{kbId:p.get("kbId")??"",id:p.get("id")??undefined,before:p.get("before")??undefined}:undefined),{headers});
  }catch(error){const failure=rebuildFailure(error);return NextResponse.json({error:failure.code},{status:failure.status,headers});}
}
export const GET=handle;
export const POST=handle;

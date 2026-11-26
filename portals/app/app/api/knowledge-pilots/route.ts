import {NextResponse} from "next/server";
import {requireAuth} from "../../kb/api/http";
import {getOidcConfig} from "../../auth/lib/config";
import {userAdmission} from "../../platform/admission";
import {reviewOriginAllowed} from "../../kb/semantic/review-request";
import {pilotService,pilotFailure} from "../../kb/semantic/pilot-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
async function handle(req:Request){
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
    const p=new URL(req.url).searchParams;
    if([...p.keys()].some(k=>!["kbId","id","before","historyBefore"].includes(k))||[...p.keys()].some(k=>p.getAll(k).length>1)||(req.method==="POST"&&p.size)||
      (p.has("historyBefore")&&!/^[1-9][0-9]{0,9}$/.test(p.get("historyBefore")!)))throw Error("pilot_invalid_request");
    let body:unknown;
    if(req.method==="POST"){
      const text=await req.text();if(text.length>16384)throw Error("pilot_invalid_request");
      try{body=JSON.parse(text);}catch{throw Error("pilot_invalid_request");}
    }
    const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    return NextResponse.json(await pilotService(who,body,async()=>(await userAdmission(auth.user)).allowed,
      req.method==="GET"?{kbId:p.get("kbId")??"",id:p.get("id")??undefined,before:p.get("before")??undefined,historyBefore:p.has("historyBefore")?Number(p.get("historyBefore")):undefined}:undefined),{headers});
  }catch(error){const value=pilotFailure(error);return NextResponse.json({error:value.code},{status:value.status,headers});}
}
export const GET=handle;
export const POST=handle;

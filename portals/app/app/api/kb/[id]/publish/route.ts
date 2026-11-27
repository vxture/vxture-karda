import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {getOidcConfig} from "../../../../auth/lib/config";
import {userAdmission} from "../../../../platform/admission";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {sharingService,sharingFailure} from "../../../../kb/lib/sharing-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
 try{
  const auth=await requireAuth("service.publish");if(!auth.ok)return auth.response;
  if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
  const p=new URL(req.url).searchParams;if([...p.keys()].some(k=>k!=="before")||p.getAll("before").length>1||(req.method==="POST"&&p.size)||(p.has("before")&&!/^[1-9][0-9]{0,9}$/.test(p.get("before")!)))throw Error("sharing_invalid_request");
  let body:unknown;if(req.method==="POST"){const text=await req.text();if(text.length>8192)throw Error("sharing_invalid_request");try{body=JSON.parse(text);}catch{throw Error("sharing_invalid_request");}}
  const {id}=await ctx.params,who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
  return NextResponse.json(await sharingService(who,id,body,async()=>(await userAdmission(auth.user)).allowed,req.method==="GET",p.has("before")?Number(p.get("before")):undefined),{headers});
 }catch(error){const failure=sharingFailure(error);return NextResponse.json({error:failure.code},{status:failure.status,headers});}
}
export const GET=handle;
export const POST=handle;

import {NextResponse} from "next/server";
import {requireAuth} from "../../kb/api/http";
import {userAdmission} from "../../platform/admission";
import {getOidcConfig} from "../../auth/lib/config";
import {reviewOriginAllowed} from "../../kb/semantic/review-request";
import {subscriptionService,subscriptionFailure} from "../../kb/semantic/subscription-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request){
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
    const params=new URL(req.url).searchParams;
    if([...params.keys()].some(k=>!["before","deliveryStatus"].includes(k))||[...params.keys()].some(k=>params.getAll(k).length>1)||(req.method==="POST"&&params.size))throw Error("subscription_invalid_request");
    const text=req.method==="POST"?await req.text():"";if(text.length>8192)throw Error("subscription_invalid_request");
    let body:unknown;try{body=req.method==="POST"?JSON.parse(text):{action:"list",...(params.has("before")?{before:params.get("before")}:{}) ,...(params.has("deliveryStatus")?{deliveryStatus:params.get("deliveryStatus")}:{})};}catch{throw Error("subscription_invalid_request");}
    const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    return NextResponse.json(await subscriptionService(who,body,async()=>(await userAdmission(auth.user)).allowed),{headers});
  }catch(error){const failure=subscriptionFailure(error);return NextResponse.json({error:failure.code},{status:failure.status,headers});}
}
export const GET=handle;
export const POST=handle;

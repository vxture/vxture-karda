import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {getOidcConfig} from "../../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {topicDossiers} from "../../../../kb/semantic/topic-dossier-store";
import {executeTopicSummary} from "../../../../kb/semantic/topic-summary-execution";

export const dynamic="force-dynamic";
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store"};
  const auth=await requireAuth("service.publish");if(!auth.ok)return auth.response;
  try{
    const {id}=await ctx.params;
    let request:Parameters<typeof topicDossiers>[2]={action:"list"};
    if(req.method==="POST"){
      if(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json"))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
      const text=await req.text();if(Buffer.byteLength(text)>16384)throw new Error("semantic_topic_invalid");
      let value:Record<string,unknown>;try{value=JSON.parse(text);}catch{throw new Error("semantic_topic_invalid");}
      if(!value||typeof value!=="object"||Array.isArray(value)||typeof value.id!=="string")throw new Error("semantic_topic_invalid");
      const keys=Object.keys(value).sort().join(",");
      if(keys==="id,relationType"&&typeof value.relationType==="string")request={action:"compose",id:value.id,relationType:value.relationType};
      else if(keys==="action,dossierId,id"&&value.action==="generate"&&typeof value.dossierId==="string"){
        const generated=await executeTopicSummary({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},id,value.id,value.dossierId,async()=>(await userAdmission(auth.user)).allowed);
        return NextResponse.json(generated,{headers});
      }else if(keys==="action,decision,dossierId,expectedRevision,id,note"&&value.action==="review"&&typeof value.dossierId==="string"&&
        typeof value.note==="string"&&typeof value.expectedRevision==="number"&&["accept","reject","revise"].includes(value.decision as string))
        request={action:"summary_review",id:value.id,dossierId:value.dossierId,expectedRevision:value.expectedRevision,decision:value.decision as "accept"|"reject"|"revise",note:value.note};
      else throw new Error("semantic_topic_invalid");
    }
    const value=await topicDossiers({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},id,request,async()=>(await userAdmission(auth.user)).allowed);
    return NextResponse.json(value,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    const known=["semantic_topic_invalid","semantic_topic_denied","semantic_topic_conflict","semantic_topic_empty","semantic_topic_incomplete","semantic_topic_budget"].includes(code);
    return NextResponse.json({error:known?code:"semantic_topic_unavailable"},{status:code==="semantic_topic_denied"?403:code==="semantic_topic_invalid"?400:known?409:503,headers});
  }
}
export const GET=handle;export const POST=handle;

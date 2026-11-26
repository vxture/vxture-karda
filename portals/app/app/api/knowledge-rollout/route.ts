import {NextResponse} from "next/server";
import {requireAuth} from "../../kb/api/http";
import {getOidcConfig} from "../../auth/lib/config";
import {userAdmission} from "../../platform/admission";
import {reviewOriginAllowed} from "../../kb/semantic/review-request";
import {parseRolloutCommand} from "../../kb/semantic/rollout-control";
import {knowledgeRollout} from "../../kb/semantic/rollout-postgres";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
async function handle(req?:Request){
  const auth=await requireAuth("product.manage");if(!auth.ok)return auth.response;
  try{
    let command;
    if(req){
      if(!reviewOriginAllowed(req,getOidcConfig().appOrigin))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
      if(!req.headers.get("content-type")?.startsWith("application/json"))return NextResponse.json({error:"json_required"},{status:415,headers});
      const text=await req.text();if(Buffer.byteLength(text)>8192)throw Error("knowledge_rollout_invalid");
      let body:unknown;try{body=JSON.parse(text);}catch{throw Error("knowledge_rollout_invalid");}command=parseRolloutCommand(body);
    }
    const result=await knowledgeRollout({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},async()=>(await userAdmission(auth.user)).allowed,command);
    return NextResponse.json(result,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    const status=code==="knowledge_rollout_invalid"?400:code==="knowledge_rollout_denied"?403:code==="knowledge_rollout_conflict"?409:503;
    return NextResponse.json({error:status===503?"knowledge_rollout_unavailable":code},{status,headers});
  }
}
export async function GET(){return handle();}
export async function POST(req:Request){return handle(req);}

import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {getOidcConfig} from "../../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {parseSourceSearch} from "../../../../kb/retrieval/source-search";
import {readSourceSearch,meterSourceSearch} from "../../../../kb/retrieval/source-search-postgres";
import {sourceSearchError} from "../../../../kb/retrieval/source-search-tool";

export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store"};
  const auth=await requireAuth("ai.use");if(!auth.ok)return auth.response;
  if(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({error:"origin_invalid"},{status:403,headers});
  try{
    const text=await req.text();if(Buffer.byteLength(text)>4096)throw new Error("source_search_invalid_request");
    let body:Record<string,unknown>;
    try{body=JSON.parse(text);}catch{throw new Error("source_search_invalid_request");}
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["query","top_k","verification_filter"].includes(k)))
      throw new Error("source_search_invalid_request");
    const {id}=await ctx.params,input=parseSourceSearch({...body,kb_ids:[id]});
    const result=await readSourceSearch({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},input,
      async()=>(await userAdmission(auth.user)).allowed);
    await meterSourceSearch(auth.user.activeWorkspace);
    return NextResponse.json(result,{headers});
  }catch(error){const result=sourceSearchError(error);return NextResponse.json(result.body,{status:result.status,headers});}
}

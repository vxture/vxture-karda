import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {getOidcConfig} from "../../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {parsePublishedSearch} from "../../../../kb/semantic/published-search";
import {readPublishedSearch} from "../../../../kb/semantic/published-search-service";
import {publishedSearchError} from "../../../../kb/semantic/published-search-tool";
import {meterSourceSearch} from "../../../../kb/retrieval/source-search-postgres";

export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  const auth=await requireAuth("ai.use");if(!auth.ok)return auth.response;
  if(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json"))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
  try{
    const text=await req.text();if(Buffer.byteLength(text)>16384)throw new Error("published_search_invalid_request");
    let body:Record<string,unknown>;try{body=JSON.parse(text);}catch{throw new Error("published_search_invalid_request");}
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["query","top_k","relation_types","page_cursor"].includes(k)))throw new Error("published_search_invalid_request");
    const {id}=await ctx.params,input=parsePublishedSearch({...body,kb_ids:[id]});
    const result=await readPublishedSearch({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},input,async()=>(await userAdmission(auth.user)).allowed);
    await meterSourceSearch(auth.user.activeWorkspace);return NextResponse.json(result,{headers});
  }catch(error){const result=publishedSearchError(error);return NextResponse.json(result.body,{status:result.status,headers});}
}

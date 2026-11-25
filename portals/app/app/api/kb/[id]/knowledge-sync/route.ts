import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {parseKnowledgeSync,readKnowledgeSync} from "../../../../kb/semantic/knowledge-sync";

export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  try{
    const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
    const url=new URL(req.url),{id}=await ctx.params;
    const allowed=["entity","hops","nodes","edges","type","cursor","known_revision"];
    if([...url.searchParams.keys()].some(k=>!allowed.includes(k))||["hops","nodes","edges","cursor","known_revision"].some(k=>url.searchParams.getAll(k).length>1))
      throw new Error("semantic_invalid_sync_request");
    const input=parseKnowledgeSync({kb_id:id,entity_ids:url.searchParams.getAll("entity"),
      max_hops:Number(url.searchParams.get("hops")??1),max_nodes:Number(url.searchParams.get("nodes")??50),max_edges:Number(url.searchParams.get("edges")??100),
      ...(url.searchParams.has("type")?{relation_types:url.searchParams.getAll("type")}:{}),
      ...(url.searchParams.has("cursor")?{page_cursor:url.searchParams.get("cursor")}:{}),
      ...(url.searchParams.has("known_revision")?{known_revision:url.searchParams.get("known_revision")}: {})});
    const result=await readKnowledgeSync({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},input,
      async()=>(await userAdmission(auth.user)).allowed);
    return NextResponse.json(result,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return NextResponse.json({error:["semantic_invalid_sync_request","semantic_read_denied","semantic_directory_changed"].includes(code)?code:"semantic_sync_unavailable"},
      {status:code==="semantic_invalid_sync_request"?400:code==="semantic_read_denied"?403:code==="semantic_directory_changed"?409:503,headers});
  }
}

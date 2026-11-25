import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {parsePackageRequest,readKnowledgePackage} from "../../../../kb/semantic/knowledge-package";
import {packageMarkdown} from "../../../../kb/semantic/package-markdown";

export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {
  const headers={"Cache-Control":"private, no-store"};
  try{
    const url=new URL(req.url),exporting=url.searchParams.get("format")==="markdown";
    const auth=await requireAuth(exporting?"data.export":"data.read");if(!auth.ok)return auth.response;
    const {id}=await ctx.params;
    if([...url.searchParams.keys()].some(k=>!["entity","hops","nodes","edges","type","format","cursor"].includes(k))||
      url.searchParams.getAll("cursor").length>1||
      (url.searchParams.has("format")&&!exporting))throw new Error("semantic_invalid_package_request");
    const input=parsePackageRequest({kb_id:id,entity_ids:url.searchParams.getAll("entity"),
      max_hops:Number(url.searchParams.get("hops")??1),max_nodes:Number(url.searchParams.get("nodes")??50),
      max_edges:Number(url.searchParams.get("edges")??100),
      ...(url.searchParams.has("cursor")?{page_cursor:url.searchParams.get("cursor")}:{}),
      ...(url.searchParams.has("type")?{relation_types:url.searchParams.getAll("type")}: {})});
    const result=await readKnowledgePackage({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,
      roles:[...auth.user.roles],productCode:"karda"},input,async()=> (await userAdmission(auth.user)).allowed,exporting);
    if(exporting)return new Response(packageMarkdown(result),{headers:{...headers,"Content-Type":"text/markdown; charset=utf-8",
      "Content-Disposition":'attachment; filename="published-knowledge.md"',"X-Content-Type-Options":"nosniff"}});
    return NextResponse.json(result,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return NextResponse.json({error:["semantic_invalid_package_request","semantic_read_denied","semantic_directory_changed"].includes(code)?code:"semantic_package_unavailable"},
      {status:code==="semantic_invalid_package_request"?400:code==="semantic_read_denied"?403:code==="semantic_directory_changed"?409:503,headers});
  }
}

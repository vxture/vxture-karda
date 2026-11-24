import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {parsePackageRequest,readKnowledgePackage} from "../../../../kb/semantic/knowledge-package";

export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {
  const headers={"Cache-Control":"private, no-store"};
  try{
    const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
    const {id}=await ctx.params,url=new URL(req.url);
    if([...url.searchParams.keys()].some(k=>k!=="entity"))throw new Error("semantic_invalid_package_request");
    const input=parsePackageRequest({kb_id:id,entity_ids:url.searchParams.getAll("entity")});
    const result=await readKnowledgePackage({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,
      roles:[...auth.user.roles],productCode:"karda"},input,async()=> (await userAdmission(auth.user)).allowed);
    return NextResponse.json(result,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return NextResponse.json({error:code==="semantic_invalid_package_request"?code:code==="semantic_read_denied"?code:"semantic_package_unavailable"},
      {status:code==="semantic_invalid_package_request"?400:code==="semantic_read_denied"?403:503,headers});
  }
}

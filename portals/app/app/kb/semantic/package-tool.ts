import {permits} from "../../authz/policy";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {parsePackageRequest,readKnowledgePackage} from "./knowledge-package";

export async function knowledgePackageTool(caller:CallerContext,args:Record<string,unknown>,read=readKnowledgePackage):Promise<DispatchResult> {
  // S2S gateway already revalidated delegated platform authority. SQL independently
  // rechecks current local roles and the calling product's attachment intersection.
  if(caller.mode!=="obo"||!caller.user||!caller.workspace||!permits(caller.productAccess,"data.read"))
    return {status:403,body:{error:"access_denied"}};
  try{
    const input=parsePackageRequest(args);
    const result=await read({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},input,
      async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read"));
    return {status:200,body:{result}};
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return {status:code==="semantic_invalid_package_request"?400:code==="semantic_read_denied"?403:code==="semantic_directory_changed"?409:503,
      body:{error:["semantic_invalid_package_request","semantic_read_denied","semantic_directory_changed"].includes(code)?code:"semantic_package_unavailable"}};
  }
}

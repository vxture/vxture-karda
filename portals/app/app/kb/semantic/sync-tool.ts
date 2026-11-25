import {permits} from "../../authz/policy";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {parseKnowledgeSync,readKnowledgeSync} from "./knowledge-sync";

export async function knowledgeSyncTool(caller:CallerContext,args:Record<string,unknown>,read=readKnowledgeSync):Promise<DispatchResult>{
  if(caller.mode!=="obo"||!caller.user||!caller.workspace||!permits(caller.productAccess,"product.enter")||!permits(caller.productAccess,"data.read"))
    return {status:403,body:{error:"access_denied"}};
  try{
    const input=parseKnowledgeSync(args);
    const result=await read({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},input,
      async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read"));
    return {status:200,body:{result}};
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return {status:code==="semantic_invalid_sync_request"?400:code==="semantic_read_denied"?403:code==="semantic_directory_changed"?409:503,
      body:{error:["semantic_invalid_sync_request","semantic_read_denied","semantic_directory_changed"].includes(code)?code:"semantic_sync_unavailable"}};
  }
}

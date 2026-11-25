import {permits} from "../../authz/policy";
import {UsagePersistenceError} from "../../usage/lib/buffer";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {parseSourceSearch} from "./source-search";
import {readSourceSearch,meterSourceSearch} from "./source-search-postgres";

export function sourceSearchError(error:unknown):DispatchResult{
  const code=error instanceof Error?error.message:"";
  if(error instanceof UsagePersistenceError)return {status:503,body:{error:"usage_unavailable"}};
  return {status:code==="source_search_invalid_request"?400:code==="source_search_denied"?403:503,
    body:{error:["source_search_invalid_request","source_search_denied","source_search_budget"].includes(code)?code:"source_search_unavailable"}};
}
export async function sourceSearchTool(caller:CallerContext,args:Record<string,unknown>,read=readSourceSearch,meter=meterSourceSearch):Promise<DispatchResult>{
  if(caller.mode!=="obo"||!caller.workspace||!caller.user||!permits(caller.productAccess,"data.read")||!permits(caller.productAccess,"ai.use"))
    return {status:403,body:{error:"access_denied"}};
  try{
    const request=parseSourceSearch(args);
    const result=await read({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},request,
      async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read")&&permits(caller.productAccess,"ai.use"));
    await meter(caller.workspace);
    return {status:200,body:{result}};
  }catch(error){return sourceSearchError(error);}
}

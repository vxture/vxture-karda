import {permits} from "../../authz/policy";
import {UsagePersistenceError} from "../../usage/lib/buffer";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {meterSourceSearch} from "../retrieval/source-search-postgres";
import {parsePublishedSearch} from "./published-search";
import {readPublishedSearch} from "./published-search-service";

export function publishedSearchError(error:unknown):DispatchResult{
  const code=error instanceof Error?error.message:"";
  if(error instanceof UsagePersistenceError)return {status:503,body:{error:"usage_unavailable"}};
  return {status:code==="published_search_invalid_request"?400:code==="semantic_read_denied"?403:503,
    body:{error:["published_search_invalid_request","semantic_read_denied","published_search_budget"].includes(code)?code:"published_search_unavailable"}};
}
export async function publishedSearchTool(caller:CallerContext,args:Record<string,unknown>,read=readPublishedSearch,meter=meterSourceSearch):Promise<DispatchResult>{
  if(caller.mode!=="obo"||!caller.workspace||!caller.user||!permits(caller.productAccess,"product.enter")||!permits(caller.productAccess,"data.read")||!permits(caller.productAccess,"ai.use"))return {status:403,body:{error:"access_denied"}};
  try{
    const result=await read({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},parsePublishedSearch(args),
      async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read")&&permits(caller.productAccess,"ai.use"));
    await meter(caller.workspace);return {status:200,body:{result}};
  }catch(error){return publishedSearchError(error);}
}

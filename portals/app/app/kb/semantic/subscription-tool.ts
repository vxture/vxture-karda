import {permits} from "../../authz/policy";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {subscriptionService,subscriptionFailure} from "./subscription-service";
export async function subscriptionTool(caller:CallerContext,args:Record<string,unknown>,handle=subscriptionService):Promise<DispatchResult>{
  if(caller.mode!=="obo"||!caller.user||!caller.workspace||!permits(caller.productAccess,"product.enter")||!permits(caller.productAccess,"data.read"))return {status:403,body:{error:"access_denied"}};
  try{
    const result=await handle({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},args,
      async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read"));
    return {status:200,body:{result}};
  }catch(error){const failure=subscriptionFailure(error);return {status:failure.status,body:{error:failure.code}};}
}

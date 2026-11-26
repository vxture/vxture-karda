import {permits} from "../../authz/policy";
import type {CallerContext} from "../tools/s2s";
import type {DispatchResult} from "../tools/dispatch";
import {parseTopicKnowledge,readTopicKnowledge} from "./topic-knowledge";
export function topicKnowledgeError(error:unknown):DispatchResult{
  const code=error instanceof Error?error.message:"";
  const status=code==="topic_knowledge_invalid"?400:code==="semantic_read_denied"?403:code==="topic_knowledge_changed"?409:503;
  return {status,body:{error:["topic_knowledge_invalid","semantic_read_denied","topic_knowledge_changed","topic_knowledge_incomplete","knowledge_rollout_paused"].includes(code)?code:"topic_knowledge_unavailable"}};
}
export async function topicKnowledgeTool(caller:CallerContext,args:Record<string,unknown>,read=readTopicKnowledge):Promise<DispatchResult>{
  if(caller.mode!=="obo"||!caller.workspace||!caller.user||!permits(caller.productAccess,"product.enter")||!permits(caller.productAccess,"data.read"))return {status:403,body:{error:"access_denied"}};
  try{const result=await read({workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},parseTopicKnowledge(args),
    async()=>permits(caller.productAccess,"product.enter")&&permits(caller.productAccess,"data.read"));return {status:200,body:{result}};
  }catch(error){return topicKnowledgeError(error);}
}

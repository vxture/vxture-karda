import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {parseTopicKnowledge,readTopicKnowledge} from "../../../../kb/semantic/topic-knowledge";
import {topicKnowledgeError} from "../../../../kb/semantic/topic-knowledge-tool";
export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
  try{
    const params=new URL(req.url).searchParams;
    if([...params.keys()].some(k=>!["action","relation_type","summary_id","before"].includes(k))||[...new Set(params.keys())].some(k=>params.getAll(k).length!==1))throw Error("topic_knowledge_invalid");
    const {id}=await ctx.params,input=parseTopicKnowledge({kb_id:id,...Object.fromEntries(params)});
    const result=await readTopicKnowledge({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},input,async()=>(await userAdmission(auth.user)).allowed);
    return NextResponse.json(result,{headers});
  }catch(error){const result=topicKnowledgeError(error);return NextResponse.json(result.body,{status:result.status,headers});}
}

import {pageTitle} from "../../../_i18n/server-locale";
import {operations} from "../../../_i18n/messages/operations";
import {OperationsClient} from "./operations-client";
export async function generateMetadata(){return pageTitle(operations.title);}
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const query=await searchParams;
  return <OperationsClient key={typeof query.taskId==="string"?query.taskId:"default"} initialTaskId={typeof query.taskId==="string"?query.taskId:undefined} initialKb={typeof query.kbId==="string"?query.kbId:""}
    initialTarget={typeof query.targetId==="string"?query.targetId:""} initialType={typeof query.targetType==="string"?query.targetType:"library"}/>;
}

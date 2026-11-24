import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {PublishedKnowledgeClient} from "./published-client";

export async function generateMetadata(){return pageTitle(semantic.knowledgeTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <PublishedKnowledgeClient key={kbId} kbId={kbId}/>;
}

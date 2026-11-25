import {initialKnowledgeEntity} from "../../../../_lib/knowledge-window";
import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {GraphClient} from "./graph-client";
export async function generateMetadata(){return pageTitle(semantic.graphTitle);}
export default async function Page({params,searchParams}:{params:Promise<{kbId:string}>;searchParams:Promise<{entity?:string|string[]}>}){
  const {kbId}=await params,initialEntity=initialKnowledgeEntity((await searchParams).entity);return <GraphClient key={`${kbId}/${initialEntity}`} kbId={kbId} initialEntity={initialEntity}/>;
}

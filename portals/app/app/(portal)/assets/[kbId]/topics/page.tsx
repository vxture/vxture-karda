import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {TopicsClient} from "./topics-client";
export async function generateMetadata(){return pageTitle(semantic.dossierTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <TopicsClient key={kbId} kbId={kbId}/>;
}

import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {HistoryClient} from "./history-client";
export async function generateMetadata(){return pageTitle(semantic.historyTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <HistoryClient key={kbId} kbId={kbId}/>;
}

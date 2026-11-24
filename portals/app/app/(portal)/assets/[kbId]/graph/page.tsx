import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {GraphClient} from "./graph-client";
export async function generateMetadata(){return pageTitle(semantic.graphTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <GraphClient key={kbId} kbId={kbId}/>;
}

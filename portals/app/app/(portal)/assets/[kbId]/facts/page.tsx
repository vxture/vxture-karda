import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {FactSearchClient} from "./fact-search-client";
export async function generateMetadata(){return pageTitle(semantic.factSearchTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <FactSearchClient key={kbId} kbId={kbId}/>;}

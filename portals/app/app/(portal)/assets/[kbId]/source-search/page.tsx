import {SourceSearchClient} from "../sources/source-search-client";
import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
export async function generateMetadata(){return pageTitle(semantic.sourceSearchTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <SourceSearchClient kbId={kbId}/>;}

import {pageTitle} from "../../../../_i18n/server-locale";
import {sources} from "../../../../_i18n/messages/sources";
import {SourcesClient} from "./sources-client";
export async function generateMetadata(){return pageTitle(sources.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <SourcesClient kbId={kbId}/>;}

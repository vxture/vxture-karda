import {pageTitle} from "../../../../_i18n/server-locale";
import {sharing} from "../../../../_i18n/messages/sharing";
import {SharingClient} from "./sharing-client";
export async function generateMetadata(){return pageTitle(sharing.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <SharingClient kbId={kbId}/>;}

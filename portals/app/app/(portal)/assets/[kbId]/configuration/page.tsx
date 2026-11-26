import {pageTitle} from "../../../../_i18n/server-locale";
import {profiles} from "../../../../_i18n/messages/profiles";
import {ProfilesClient} from "./profiles-client";
export async function generateMetadata(){return pageTitle(profiles.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <ProfilesClient key={kbId} kbId={kbId}/>;}

import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {MaintenanceClient} from "./maintenance-client";
export async function generateMetadata(){return pageTitle(semantic.maintenanceTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <MaintenanceClient key={kbId} kbId={kbId}/>;
}

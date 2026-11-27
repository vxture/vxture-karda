import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {MaintenanceClient} from "./maintenance-client";
export async function generateMetadata(){return pageTitle(semantic.maintenanceTitle);}
export default async function Page({params,searchParams}:{params:Promise<{kbId:string}>;searchParams:Promise<{documentId?:string}>}){
  const {kbId}=await params,{documentId}=await searchParams;return <MaintenanceClient key={kbId} kbId={kbId} initialDocumentId={typeof documentId==="string"?documentId:""}/>;
}

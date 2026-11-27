import {pageTitle} from '../../../../_i18n/server-locale';
import {automaticConnectors} from '../../../../_i18n/messages/automatic-connectors';
import {AutomaticConnectors} from './connectors-client';
export async function generateMetadata(){return pageTitle(automaticConnectors.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){return <AutomaticConnectors kbId={(await params).kbId}/>;}

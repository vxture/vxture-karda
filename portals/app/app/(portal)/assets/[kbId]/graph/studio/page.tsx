import {pageTitle} from '../../../../../_i18n/server-locale';
import {graphCenter} from '../../../../../_i18n/messages/graph-center';
import {GraphStudio} from './studio-client';
export async function generateMetadata(){return pageTitle(graphCenter.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){return <GraphStudio kbId={(await params).kbId}/>;}

import {pageTitle} from '../../../_i18n/server-locale';
import {visualMessages} from '../../../_i18n/messages/visual';
import {VisualCenter} from './visual-center';
export async function generateMetadata(){return pageTitle(visualMessages.title);}
export default async function Page({searchParams}:{searchParams:Promise<{kbId?:string;documentId?:string;runId?:string;assetId?:string}>}){const p=await searchParams;return <VisualCenter initial={p}/>;}

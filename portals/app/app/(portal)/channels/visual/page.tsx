import {pageTitle} from '../../../_i18n/server-locale';
import {visualMessages} from '../../../_i18n/messages/visual';
import {VisualReader} from './visual-reader';
export async function generateMetadata(){return pageTitle(visualMessages.search);}
export default async function Page({searchParams}:{searchParams:Promise<{kbId?:string;assetId?:string;versionId?:string}>}){return <VisualReader initial={await searchParams}/>;}

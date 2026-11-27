import {pageTitle} from '../../../../_i18n/server-locale';
import {contributions} from '../../../../_i18n/messages/contributions';
import {ContributionCenter} from './contribution-client';
export async function generateMetadata(){return pageTitle(contributions.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){return <ContributionCenter kbId={(await params).kbId}/>;}

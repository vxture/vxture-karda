import {pageTitle} from '../../../../_i18n/server-locale';
import {identityCenter} from '../../../../_i18n/messages/identity-center';
import {IdentityCenter} from './identity-client';
export async function generateMetadata(){return pageTitle(identityCenter.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){return <IdentityCenter kbId={(await params).kbId}/>;}

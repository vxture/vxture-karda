import {pageTitle} from '../../../_i18n/server-locale';
import {productionMessages} from '../../../_i18n/messages/production';
import {ProductionClient} from './production-client';
export async function generateMetadata(){return pageTitle(productionMessages.title);}
export default async function Page({searchParams}:{searchParams:Promise<{id?:string}>}){const id=(await searchParams).id;return <ProductionClient initialId={typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)?id:''}/>;}

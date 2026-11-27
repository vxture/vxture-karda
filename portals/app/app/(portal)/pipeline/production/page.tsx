import {pageTitle} from '../../../_i18n/server-locale';
import {productionMessages} from '../../../_i18n/messages/production';
import {ProductionClient} from './production-client';
export async function generateMetadata(){return pageTitle(productionMessages.title);}
export default function Page(){return <ProductionClient/>;}

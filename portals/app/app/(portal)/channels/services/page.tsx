import {pageTitle} from '../../../_i18n/server-locale';
import {knowledgeServices} from '../../../_i18n/messages/knowledge-services';
import {ServiceCenter} from './service-center';
export async function generateMetadata(){return pageTitle(knowledgeServices.title);}
export default function Page(){return <ServiceCenter/>;}

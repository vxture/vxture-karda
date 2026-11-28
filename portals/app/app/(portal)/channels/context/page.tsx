import {pageTitle} from '../../../_i18n/server-locale';
import {taskContext} from '../../../_i18n/messages/task-context';
import {ServiceCenter} from '../services/service-center';
export async function generateMetadata(){return pageTitle(taskContext.title);}
export default function Page(){return <ServiceCenter contextOnly/>;}

import {pageTitle} from '../../../_i18n/server-locale';
import {pushMessages} from '../../../_i18n/messages/push';
import {PushClient} from './push-client';
export async function generateMetadata(){return pageTitle(pushMessages.title);}
export default function Page(){return <PushClient/>;}

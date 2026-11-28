import {pageTitle} from '../../../_i18n/server-locale';
import {publicKnowledge} from '../../../_i18n/messages/public-knowledge';
import PublicCenter from './public-center';
export async function generateMetadata(){return pageTitle(publicKnowledge.title);}
export default function Page(){return <PublicCenter/>;}

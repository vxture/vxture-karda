import {pageTitle} from "../../_i18n/server-locale";
import {semantic} from "../../_i18n/messages/semantic";
import {KnowledgeControlClient} from "./rollout-client";
export async function generateMetadata(){return pageTitle(semantic.rolloutTitle);}
export default function Page(){return <KnowledgeControlClient/>;}

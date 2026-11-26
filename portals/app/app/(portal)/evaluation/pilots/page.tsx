import {pageTitle} from "../../../_i18n/server-locale";
import {pilots} from "../../../_i18n/messages/pilots";
import {PilotsClient} from "./pilots-client";
export async function generateMetadata(){return pageTitle(pilots.title);}
export default function Page(){return <PilotsClient/>;}

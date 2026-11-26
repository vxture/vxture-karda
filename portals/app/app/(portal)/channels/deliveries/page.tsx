import {pageTitle} from "../../../_i18n/server-locale";
import {deliveries} from "../../../_i18n/messages/deliveries";
import {DeliveriesClient} from "./deliveries-client";
export async function generateMetadata(){return pageTitle(deliveries.title);}
export default function Page(){return <DeliveriesClient/>;}

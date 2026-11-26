import {pageTitle} from "../../../_i18n/server-locale";
import {subscriptions} from "../../../_i18n/messages/subscriptions";
import {SubscriptionsClient} from "./subscriptions-client";
export async function generateMetadata(){return pageTitle(subscriptions.title);}
export default function Page(){return <SubscriptionsClient/>;}

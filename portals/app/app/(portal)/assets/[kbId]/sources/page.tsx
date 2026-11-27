import {pageTitle} from "../../../../_i18n/server-locale";
import {sources} from "../../../../_i18n/messages/sources";
import {SourcesClient} from "./sources-client";
export async function generateMetadata(){return pageTitle(sources.title);}
export default async function Page({params,searchParams}:{params:Promise<{kbId:string}>;searchParams:Promise<{bindingId?:string}>}){const {kbId}=await params,binding=(await searchParams).bindingId;return <SourcesClient kbId={kbId} initialBinding={typeof binding==='string'&&/^[a-f0-9-]{36}$/.test(binding)?binding:''}/>;}

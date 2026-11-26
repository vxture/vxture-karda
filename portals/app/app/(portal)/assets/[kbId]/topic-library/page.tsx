import {pageTitle} from "../../../../_i18n/server-locale";
import {semantic} from "../../../../_i18n/messages/semantic";
import {TopicLibraryClient} from "./topic-library-client";
export async function generateMetadata(){return pageTitle(semantic.topicLibraryTitle);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){const {kbId}=await params;return <TopicLibraryClient key={kbId} kbId={kbId}/>;}

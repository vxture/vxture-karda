import {pageTitle} from "../../_i18n/server-locale";
import {workCenter} from "../../_i18n/messages/work-center";
import {PipelineClient} from "./pipeline-client";
export async function generateMetadata(){return pageTitle(workCenter.title);}
export default function PipelinePage(){return <PipelineClient/>;}

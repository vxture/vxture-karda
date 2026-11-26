import {pageTitle} from "../../../../_i18n/server-locale";
import {ocr} from "../../../../_i18n/messages/ocr";
import {OcrClient} from "./ocr-client";
export async function generateMetadata(){return pageTitle(ocr.title);}
export default async function Page({params,searchParams}:{params:Promise<{kbId:string}>;searchParams:Promise<{documentId?:string;draftId?:string}>}){
  const {kbId}=await params,query=await searchParams;return <OcrClient key={`${kbId}/${query.documentId??""}/${query.draftId??""}`} kbId={kbId} initialDocumentId={query.documentId} initialDraftId={query.draftId}/>;
}

import {pageTitle} from "../../../../_i18n/server-locale";
import {ocr} from "../../../../_i18n/messages/ocr";
import {OcrClient} from "./ocr-client";
export async function generateMetadata(){return pageTitle(ocr.title);}
export default async function Page({params}:{params:Promise<{kbId:string}>}){
  const {kbId}=await params;return <OcrClient key={kbId} kbId={kbId}/>;
}

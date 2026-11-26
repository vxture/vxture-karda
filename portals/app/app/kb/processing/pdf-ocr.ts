import {access,mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {execFile} from "node:child_process";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {atlasPost,type AtlasClientCore,type AtlasContext} from "../atlas/client";
import {PDF_MIME,SOURCE_BYTE_LIMIT,sourceHash,snapshotValid,type SourceSnapshot} from "./source-snapshot";

export const OCR_PARSER="atlas-ocr-v1";
export interface OcrPage {pageIndex:number;spans:{bbox:[number,number,number,number];text:string}[]}
export interface OcrPayload {modelCode:string;pages:OcrPage[];snapshot:SourceSnapshot}
let rendering=0;
/** Rasterization is local; all recognition is delegated to Atlas. */
export async function renderOcrPages(bytes:Buffer):Promise<string[]>{
  if(!bytes.length||bytes.length>SOURCE_BYTE_LIMIT||!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))throw Error("ocr_invalid_pdf");
  if(rendering>=2)throw Error("ocr_renderer_busy");
  rendering++;let folder:string|undefined;
  try{
    let script="";
    for(const candidate of ["source-tools/render-pdf-ocr.py","../../source-tools/render-pdf-ocr.py","../../scripts/knowledge/render-pdf-ocr.py"]){
      const path=resolve(process.cwd(),candidate);try{await access(path);script=path;break;}catch{/* next layout */}
    }
    if(!script)throw Error("ocr_renderer_unavailable");
    folder=await mkdtemp(join(tmpdir(),"karda-ocr-"));const input=join(folder,"source.pdf");
    await writeFile(input,bytes,{flag:"wx",mode:0o600});
    const result=await new Promise<string>((ok,fail)=>execFile(process.env.KARDA_KNOWLEDGE_PYTHON||"python3",["-I",script,input,folder!],
      {timeout:60000,maxBuffer:4096,windowsHide:true,encoding:"utf8"},(error,out)=>error?fail(Error("ocr_render_refused")):ok(out)));
    const count=JSON.parse(result).pages;if(!Number.isInteger(count)||count<1||count>20)throw Error("ocr_render_refused");
    const pages:string[]=[];let budget=12*1024*1024;
    for(let i=0;i<count;i++){
      const bytes=await readFile(join(folder,`page-${i}.png`));budget-=bytes.length;
      if(budget<0)throw Error("ocr_image_budget");pages.push(bytes.toString("base64"));
    }
    return pages;
  }finally{try{if(folder)await rm(folder,{recursive:true,force:true});}finally{rendering--;}}
}

/** Preserve provider reading order and exact text. Never infer missing pages. */
export function ocrPayload(raw:unknown,bytes:Buffer,pageCount:number,modelCode:string):OcrPayload{
  const data=raw as {task?:unknown;modelCode?:unknown;pages?:OcrPage[]};
  if(!data||data.task!=="ocr"||data.modelCode!==modelCode||!Array.isArray(data.pages)||data.pages.length!==pageCount||pageCount<1||pageCount>20)
    throw Error("ocr_response_invalid");
  let text="",spanCount=0;
  const locators:SourceSnapshot["locators"]=[];
  const pages=data.pages.map((page,index)=>{
    if(!page||page.pageIndex!==index||!Array.isArray(page.spans))throw Error("ocr_response_invalid");
    const spans=page.spans.map(span=>{
      const box=span?.bbox;
      if(++spanCount>20000||!Array.isArray(box)||box.length!==4||box.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0||n>1)||
        box[0]>=box[2]||box[1]>=box[3]||typeof span.text!=="string"||!span.text.trim()||span.text.includes("\0")||span.text.length>200000)
        throw Error("ocr_response_invalid");
      if(text)text+="\n\n";const start=text.length;text+=span.text;
      if(text.length>5000000)throw Error("ocr_text_budget");
      locators.push({start,end:text.length,ordinal:locators.length,page:index+1});
      return {bbox:[...box] as [number,number,number,number],text:span.text};
    });
    return {pageIndex:index,spans};
  });
  const snapshot={contentHash:sourceHash(bytes),mime:PDF_MIME,parserVersion:OCR_PARSER,textHash:sourceHash(text),text,locators};
  if(!snapshotValid(snapshot))throw Error("ocr_empty_result");
  return {modelCode,pages,snapshot};
}
export async function recognizePdf(core:AtlasClientCore,context:AtlasContext,taskId:string,modelCode:string,bytes:Buffer,
  render:(bytes:Buffer)=>Promise<string[]>=renderOcrPages):Promise<OcrPayload>{
  const images=await render(bytes);
  const body={task:"ocr",modelCode,taskId,workspaceId:context.ws,tenantId:context.org,applicationId:"karda",applicationType:"internal_service",
    pages:images.map((imageBase64,pageIndex)=>({pageIndex,imageBase64}))};
  if(Buffer.byteLength(JSON.stringify(body))>16*1024*1024)throw Error("ocr_image_budget");
  return ocrPayload(await atlasPost(core,"/v1/parse",context,body),bytes,images.length,modelCode);
}

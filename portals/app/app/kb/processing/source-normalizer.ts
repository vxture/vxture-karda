import {execFile} from "node:child_process";
import {mkdtemp,writeFile,rm,access} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {PDF_MIME,DOCX_MIME,SOURCE_BYTE_LIMIT,sourceHash,snapshotValid,type SourceSnapshot} from "./source-snapshot";
import {SOURCE_FORMATS} from "./source-formats";
let activeNormalizers=0;

export function snapshotFromExtraction(mime:string,bytes:Buffer,value:unknown):SourceSnapshot {
  const data=value as {binarySha256?:unknown;extractor?:{version?:unknown};pages?:{page:number;text:string;textSha256:string}[];paragraphs?:string[]};
  if(!data||data.binarySha256!==sourceHash(bytes)||bytes.length>SOURCE_BYTE_LIMIT)throw new Error("source_extraction_mismatch");
  let parts:{text:string;page?:number}[],parserVersion:string;
  if(mime===PDF_MIME){
    if(data.extractor?.version!=="6.21.4"||!Array.isArray(data.pages)||data.pages.length<1||data.pages.length>300||
      data.pages.some((p,i)=>p.page!==i+1||typeof p.text!=="string"||p.text.length>400000||sourceHash(p.text)!==p.textSha256))
      throw new Error("source_pdf_contract");
    parts=data.pages.filter(p=>p.text.length>0).map(p=>({text:p.text,page:p.page}));parserVersion="pypdf-6.21.4-v1";
  }else if(mime===DOCX_MIME){
    if(!Array.isArray(data.paragraphs)||data.paragraphs.some(p=>typeof p!=="string")||
      (data.extractor!==undefined&&!["docx-body-tables-v2","docx-referenced-stories-v3","docx-cell-grid-v4"].includes(String(data.extractor.version))))throw new Error("source_docx_contract");
    parts=data.paragraphs.map(text=>({text}));parserVersion=data.extractor?.version===undefined?"docx-main-body-v1":String(data.extractor.version);
  }else{
    const format=SOURCE_FORMATS.find(f=>f.mime===mime);
    if(!format)throw new Error("source_format_unsupported");
    if(data.extractor?.version!==format.parser||!Array.isArray(data.paragraphs)||data.paragraphs.some(p=>typeof p!=="string"))throw new Error(mime.includes("spreadsheetml")?"source_xlsx_contract":"source_pptx_contract");
    parts=data.paragraphs.map(text=>({text}));parserVersion=format.parser;
  }
  let text="";
  const locators=parts.map((part,ordinal)=>{if(ordinal)text+="\n\n";const start=text.length;text+=part.text;
    return {start,end:text.length,ordinal,...(part.page===undefined?{}:{page:part.page})};});
  const snapshot={contentHash:sourceHash(bytes),mime,parserVersion,textHash:sourceHash(text),text,locators};
  if(!snapshotValid(snapshot))throw new Error("source_snapshot_invalid");return snapshot;
}

/** Owned, pinned extractors run out of process with bounded input, output and time.
 * No shell interpolation, document names, remote fetches, macros or OCR. */
export async function normalizeSource(mime:string,bytes:Buffer):Promise<SourceSnapshot>{
  if(!SOURCE_FORMATS.some(f=>f.mime===mime)||bytes.length>SOURCE_BYTE_LIMIT||!bytes.length)throw new Error("source_format_unsupported");
  let script="";
  for(const path of [resolve(process.cwd(),"source-tools/normalize-source.py"),resolve(process.cwd(),"../../source-tools/normalize-source.py"),
    resolve(process.cwd(),"../../scripts/knowledge/normalize-source.py")]){
    try{await access(path);script=path;break;}catch{/* try the local development layout */}
  }
  if(!script)throw new Error("source_extractor_unavailable");
  if(activeNormalizers>=2)throw new Error("source_normalizer_busy");
  activeNormalizers++;
  let folder:string|undefined;
  try{
    folder=await mkdtemp(join(tmpdir(),"karda-source-"));
    const path=join(folder,"source.bin");await writeFile(path,bytes,{flag:"wx",mode:0o600});
    const output=await new Promise<string>((ok,fail)=>{
      execFile(process.env.KARDA_KNOWLEDGE_PYTHON||"python3",["-I",script,mime,path],
        {timeout:20000,maxBuffer:32*1024*1024,windowsHide:true,encoding:"utf8"},(error,stdout)=>{
          if(error)return fail(new Error(error.code==="ENOENT"?"source_extractor_unavailable":"source_extraction_refused"));ok(stdout);
        });
    });
    return snapshotFromExtraction(mime,bytes,JSON.parse(output));
  }finally{try{if(folder)await rm(folder,{recursive:true,force:true});}finally{activeNormalizers--;}}
}

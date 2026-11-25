import {createHash} from "node:crypto";
import {parseFastPath,type DocumentIR} from "./ir";

import {PDF_MIME,SOURCE_FORMATS} from "./source-formats";
export {PDF_MIME,DOCX_MIME,XLSX_MIME,PPTX_MIME} from "./source-formats";
export const SOURCE_BYTE_LIMIT=8*1024*1024;
export interface SourceSnapshot {
  contentHash:string; mime:string; parserVersion:string; textHash:string; text:string;
  locators:{start:number;end:number;ordinal:number;page?:number}[];
}
export const sourceHash=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
export function snapshotValid(snapshot:SourceSnapshot):boolean {
  if(!snapshot||!new RegExp("^[a-f0-9]{64}$").test(snapshot.contentHash)||typeof snapshot.text!=="string"||
    snapshot.text.length>5000000||!snapshot.text.trim()||snapshot.text.includes("\0")||sourceHash(snapshot.text)!==snapshot.textHash||
    !SOURCE_FORMATS.some(f=>f.mime===snapshot.mime&&(f.accepted as readonly string[]).includes(snapshot.parserVersion))||
    !Array.isArray(snapshot.locators)||!snapshot.locators.length||snapshot.locators.length>20000)return false;
  let end=0;
  return snapshot.locators.every((row,index)=>{
    if(!row||row.ordinal!==index||!Number.isSafeInteger(row.start)||!Number.isSafeInteger(row.end)||
      row.start<end||row.start<0||row.start>=row.end||row.end>snapshot.text.length||
      (snapshot.mime===PDF_MIME&&(!Number.isSafeInteger(row.page)||(row.page??0)<1||(row.page??0)>300))||
      (snapshot.mime!==PDF_MIME&&row.page!==undefined))return false;
    end=row.end;return true;
  });
}
export function snapshotIR(snapshot:SourceSnapshot):DocumentIR {
  if(!snapshotValid(snapshot))throw new Error("source_snapshot_invalid");
  let ordinal=0;
  return {parserVersion:snapshot.parserVersion,elements:snapshot.locators.flatMap(row=>
    parseFastPath(snapshot.text.slice(row.start,row.end)).elements.map(element=>({...element,
      range:{start:row.start+element.range.start,end:row.start+element.range.end},
      locator:{...element.locator,ordinal:ordinal++,...(row.page===undefined?{}:{page:row.page})}})))};
}

/** Version-keyed database snapshots are immutable. Readers never re-run a parser. */
export async function readSourceSnapshot(query:(sql:string,...values:unknown[])=>Promise<unknown>,documentId:string,version:number):Promise<SourceSnapshot|null>{
  const rows=await query(`SELECT content_hash AS "contentHash",mime,parser_version AS "parserVersion",text_hash AS "textHash",
    canonical_text AS text,locators FROM karda_kb.document_text_snapshot WHERE document_id=$1::uuid AND document_version=$2`,documentId,version) as SourceSnapshot[];
  return rows[0]&&snapshotValid(rows[0])?rows[0]:null;
}

import {SOURCE_FORMATS} from "../processing/source-formats";
export type SourceIssue="unsupported_format"|"not_indexed"|"version_missing"|"original_unavailable"|"snapshot_unavailable"|"text_empty";
export interface SourceCandidate {id:string;title:string;mime:string|null;content_state:string;active_chunk_version:number|null;content_hash:string|null;storage_ref:string|null;size_bytes:string|null}
export interface SourceReadiness {
  format:"karda.source-readiness.v1";scope:"current_authorized_sources";checkedAt:string;
  total:number;readable:number;blocked:number;
  items:{id:string;title:string;mime:string|null;state:string;version:number|null;parserVersion:string|null;characters:number|null;issues:SourceIssue[]}[];
}
/** A current source diagnostic, never a compilation/publication approval. */
export async function inspectSources(documents:SourceCandidate[],read:(doc:SourceCandidate)=>Promise<{text:string|null;parserVersion:string|null}>,checkedAt:()=>Promise<string>):Promise<SourceReadiness>{
  if(documents.length>100)throw new Error("semantic_source_budget");
  const items:SourceReadiness["items"]=[];let bytes=0,characters=0;
  for(const doc of [...documents].sort((a,b)=>a.id.localeCompare(b.id))){
    const native=doc.mime==="text/plain"||doc.mime==="text/markdown",format=SOURCE_FORMATS.find(f=>f.mime===doc.mime),issues:SourceIssue[]=[];
    if(!native&&!format)issues.push("unsupported_format");
    if(doc.content_state!=="indexed")issues.push("not_indexed");
    if(!Number.isSafeInteger(doc.active_chunk_version)||(doc.active_chunk_version??0)<1)issues.push("version_missing");
    const size=Number(doc.size_bytes);
    if(!doc.storage_ref||!doc.content_hash||!/^[a-f0-9]{64}$/.test(doc.content_hash)||doc.size_bytes===null||!Number.isSafeInteger(size)||size<0||size>8*1024*1024)issues.push("original_unavailable");
    let parserVersion:string|null=null,length:number|null=null;
    if(!issues.length){
      bytes+=size;if(bytes>32*1024*1024)throw new Error("semantic_source_budget");
      const value=await read(doc);parserVersion=value.parserVersion;
      if(value.text===null)issues.push(native?"original_unavailable":"snapshot_unavailable");
      else if(!value.text.trim())issues.push("text_empty");
      else{length=value.text.length;characters+=length;if(characters>16*1024*1024)throw new Error("semantic_source_budget");}
    }
    items.push({id:doc.id,title:doc.title,mime:doc.mime,state:doc.content_state,version:doc.active_chunk_version,parserVersion,characters:length,issues});
  }
  const readable=items.filter(i=>!i.issues.length).length;
  const report:SourceReadiness={format:"karda.source-readiness.v1",scope:"current_authorized_sources",checkedAt:await checkedAt(),total:items.length,readable,blocked:items.length-readable,items};
  if(Buffer.byteLength(JSON.stringify(report))>2*1024*1024)throw new Error("semantic_source_budget");
  return report;
}

import {createHash} from "node:crypto";
import type {SourceItem} from "./source-contract";
export function sourceBytes(item:SourceItem):Buffer|null{
 if(item.event==="delete")return null;const bytes=Buffer.from(item.bytes!,"base64");
 if(!bytes.length||bytes.length>8*1024*1024||bytes.toString("base64")!==item.bytes||createHash("sha256").update(bytes).digest("hex")!==item.contentHash)throw Error("source_content_invalid");return bytes;
}
export function sourceVersionDecision(current:{source_version:number;event:string;content_hash:string|null}|undefined,item:SourceItem){
 if(!current)return "apply";
 if(item.sourceVersion<current.source_version)return "obsolete";
 if(item.sourceVersion===current.source_version){if(current.event!==item.event||current.content_hash!==(item.contentHash??null))throw Error("source_version_conflict");return "unchanged";}
 return "apply";
}

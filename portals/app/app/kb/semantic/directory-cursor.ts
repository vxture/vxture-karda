import {createHash} from "node:crypto";

export function directoryFingerprint(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function encodeDirectoryCursor(hash:string,last:string):string {
  return Buffer.from(JSON.stringify({v:1,hash,last})).toString("base64url");
}
export function decodeDirectoryCursor(token:string):{hash:string;last:string} {
  const bad=():never=>{throw new Error("invalid_graph_query");};
  if(typeof token!=="string"||!token||token.length>512||!/^[A-Za-z0-9_-]+$/.test(token))return bad();
  try{
    const value=JSON.parse(Buffer.from(token,"base64url").toString("utf8"));
    if(!value||Object.keys(value).sort().join(",")!=="hash,last,v"||value.v!==1||
      typeof value.hash!=="string"||!/^([a-f0-9]{64})$/.test(value.hash)||
      typeof value.last!=="string"||!value.last||value.last.length>128||encodeDirectoryCursor(value.hash,value.last)!==token)return bad();
    return {hash:value.hash,last:value.last};
  }catch{return bad();}
}

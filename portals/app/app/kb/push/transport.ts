import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:https';
import {endpoint} from './contract';
export function publicAddress(ip:string):boolean{
 if(isIP(ip)===4){const [a,b,c]=ip.split('.').map(Number);if([0,10,127].includes(a)||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0&&c===113)return false;return true;}
 if(isIP(ip)===6){const first=parseInt(ip.split(':')[0],16);const second=parseInt(ip.split(':')[1]||'0',16);return first>=0x2000&&first<=0x3fff&&first!==0x2002&&first!==0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8));}return false;
}
export async function resolveEndpoint(value:string,resolver=lookup){const url=new URL(endpoint(value));const answers=await Promise.race([resolver(url.hostname,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('push_dns_unavailable')),4000);t.unref();})]);if(!answers.length||answers.some(a=>!publicAddress(a.address)))throw Error('push_endpoint_denied');return {url,address:answers[0].address,family:answers[0].family};}
export interface PushResponse {status:number;acknowledged:boolean}
export async function sendPush(url:string,body:Buffer,headers:Record<string,string>,eventId:string):Promise<PushResponse>{
 const pinned=await resolveEndpoint(url);return new Promise((resolve,reject)=>{
  let settled=false;const done=(e:Error|null,v?:PushResponse)=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve(v!);};
  const req=request(pinned.url,{method:'POST',agent:false,rejectUnauthorized:true,headers:{...headers,'Content-Type':'application/json','Content-Length':String(body.length),'User-Agent':'Karda-Events/1'},lookup:(_host,_options,callback)=>{callback(null,pinned.address,pinned.family);}},res=>{
   const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8192){res.destroy();req.destroy();done(Error('push_response_budget'));}else chunks.push(chunk);});
   res.on('error',()=>done(Error('push_transport_unavailable')));res.on('end',()=>{let ack=false;try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));ack=v&&v.eventId===eventId&&v.accepted===true;}catch{/* Invalid acknowledgement is a retriable delivery failure. */}done(null,{status:res.statusCode??0,acknowledged:ack});});
  });
  const timer=setTimeout(()=>{req.destroy();done(Error('push_timeout'));},8000);timer.unref();req.on('error',()=>done(Error('push_transport_unavailable')));req.end(body);
 });
}

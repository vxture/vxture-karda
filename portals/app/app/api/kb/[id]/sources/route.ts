import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {getOidcConfig} from "../../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {sourceService,sourceFailure} from "../../../../kb/connectors/source-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
async function body(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error("source_invalid_request");let size=0;const chunks:Uint8Array[]=[];
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>24*1024*1024){await reader.cancel();throw Error("source_payload_budget");}chunks.push(next.value);}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Error("source_invalid_request");}
}
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
 try{
  const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
  if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:"origin_invalid"},{status:403,headers});
  const p=new URL(req.url).searchParams;if([...p.keys()].some(k=>!["bindingId","runId","before","historyBefore","documentBefore"].includes(k))||[...p.keys()].some(k=>p.getAll(k).length>1)||(req.method==='POST'&&p.size)||(p.has('historyBefore')&&!/^[1-9][0-9]{0,9}$/.test(p.get('historyBefore')!)))throw Error("source_invalid_request");
  const {id}=await ctx.params,who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:'karda'};
  const query=req.method==='GET'?{bindingId:p.get('bindingId')??undefined,runId:p.get('runId')??undefined,before:p.get('before')??undefined,documentBefore:p.get('documentBefore')??undefined,historyBefore:p.has('historyBefore')?Number(p.get('historyBefore')):undefined}:undefined;
  return NextResponse.json(await sourceService(who,id,req.method==='POST'?await body(req):undefined,async()=>(await userAdmission(auth.user)).allowed,query),{headers});
 }catch(error){const f=sourceFailure(error);return NextResponse.json({error:f.code},{status:f.status,headers});}
}
export const GET=handle;
export const POST=handle;

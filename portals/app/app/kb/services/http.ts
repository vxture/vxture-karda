import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../api/http';
import {userAdmission} from '../../platform/admission';
import {getOidcConfig} from '../../auth/lib/config';
import {reviewOriginAllowed} from '../semantic/review-request';
import {PostgresKnowledgeServices} from './store';
import {executeKnowledgeService} from './execute';
import {serviceError} from './contract';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function serviceBody(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('service_invalid_request');const chunks:Uint8Array[]=[];let bytes=0;while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>65536){await reader.cancel();throw Error('service_request_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('service_invalid_request');}}
export async function knowledgeServiceHttp(req:Request,invoke=false){
 let pool:Pool|undefined;try{
  const auth=await requireAuth(invoke?'data.read':'data.write');if(!auth.ok)return auth.response;
  if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'origin_invalid'},{status:403,headers});
  if(!process.env.DATABASE_URL)throw Error('service_unavailable');pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,statement_timeout:15000,connectionTimeoutMillis:5000,allowExitOnIdle:true});
  const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new PostgresKnowledgeServices(pool,async()=>(await userAdmission(auth.user)).allowed);
  const p=new URL(req.url).searchParams;
  if(req.method==='POST'){if(p.size)throw Error('service_invalid_request');const body=await serviceBody(req);if(invoke){const r=await executeKnowledgeService(store,{mode:'obo',user:who.sub,workspace:who.workspaceId,org:auth.user.activeOrg??null,callerProduct:'karda',productAccess:auth.user.productAccess},body);return NextResponse.json(r.body,{status:r.status,headers});}return NextResponse.json(await store.command(who,body),{headers});}
  if([...p.keys()].some(k=>!['id','before','versionBefore','eventBefore','callBefore','callState','requestId'].includes(k)||p.getAll(k).length>1)||(p.has('eventBefore')&&!/^[1-9][0-9]{0,9}$/.test(p.get('eventBefore')!)))throw Error('service_invalid_request');
  const q=Object.fromEntries(p);return NextResponse.json(await store.browse(who,{...q,...(p.has('eventBefore')?{eventBefore:Number(p.get('eventBefore'))}:{})}),{headers});
 }catch(e){const f=serviceError(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}
}

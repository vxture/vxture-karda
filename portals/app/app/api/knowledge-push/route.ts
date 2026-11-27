import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../../kb/api/http';
import {userAdmission} from '../../platform/admission';
import {getOidcConfig} from '../../auth/lib/config';
import {reviewOriginAllowed} from '../../kb/semantic/review-request';
import {PushStore} from '../../kb/push/store';
import {parse,pushFailure} from '../../kb/push/contract';
import {resolveEndpoint} from '../../kb/push/transport';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('push_invalid_request');const chunks:Uint8Array[]=[];let size=0;while(true){const n=await reader.read();if(n.done)break;size+=n.value.byteLength;if(size>65536){await reader.cancel();throw Error('push_request_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('push_invalid_request');}}
async function handle(req:Request){let pool:Pool|undefined;try{
 const auth=await requireAuth('service.publish');if(!auth.ok)return auth.response;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'origin_invalid'},{status:403,headers});if(!process.env.DATABASE_URL)throw Error('push_unavailable');pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new PushStore(pool,async()=>(await userAdmission(auth.user)).allowed);const q=new URL(req.url).searchParams;
 if(req.method==='POST'){if(q.size)throw Error('push_invalid_request');const c=parse(await body(req));if(c.action==='create'||c.action==='configure')await resolveEndpoint(c.config.url);return NextResponse.json(await store.command(who,c),{headers});}
 if([...q.keys()].some(k=>!['id','before','eventBefore','deliveryBefore','deliveryState','deliveryId','historyBefore'].includes(k)||q.getAll(k).length>1)||q.has('historyBefore')&&(!q.has('id')||!/^[1-9][0-9]{0,9}$/.test(q.get('historyBefore')!)))throw Error('push_invalid_request');if(!q.has('id')&&['eventBefore','deliveryBefore','deliveryState','deliveryId'].some(k=>q.has(k)))throw Error('push_invalid_request');const p=Object.fromEntries(q);return NextResponse.json(await store.browse(who,{...p,...(q.has('historyBefore')?{historyBefore:Number(q.get('historyBefore'))}:{})}),{headers});
 }catch(e){const f=pushFailure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

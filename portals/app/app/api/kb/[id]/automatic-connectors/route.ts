import {NextResponse} from 'next/server';
import {requireAuth} from '../../../../kb/api/http';
import {userAdmission} from '../../../../platform/admission';
import {getOidcConfig} from '../../../../auth/lib/config';
import {reviewOriginAllowed} from '../../../../kb/semantic/review-request';
import {AutomaticStore} from '../../../../kb/connectors/automatic/store';
import {automaticPool} from '../../../../kb/connectors/automatic/runtime';
import {id,obj,failure} from '../../../../kb/connectors/automatic/contract';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('automatic_invalid_request');let size=0;const chunks:Uint8Array[]=[];while(true){const n=await reader.read();if(n.done)break;size+=n.value.byteLength;if(size>65536){await reader.cancel();throw Error('automatic_request_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('automatic_invalid_request');}}
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){let pool:ReturnType<typeof automaticPool>|undefined;try{const auth=await requireAuth('data.write');if(!auth.ok)return auth.response;const kbId=id((await ctx.params).id),q=new URL(req.url).searchParams;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))throw Error('automatic_origin_denied');pool=automaticPool();const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new AutomaticStore(pool,async()=>(await userAdmission(auth.user)).allowed);if(req.method==='POST'){if(q.size)throw Error('automatic_invalid_request');const c=obj(await body(req));if(c.kbId!==kbId)throw Error('automatic_invalid_request');return NextResponse.json(await store.command(who,c),{headers});}if([...q.keys()].some(k=>!['id','runId','before'].includes(k)||q.getAll(k).length!==1))throw Error('automatic_invalid_request');return NextResponse.json(await store.browse(who,kbId,Object.fromEntries(q)),{headers});}catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../../../../kb/api/http';
import {userAdmission} from '../../../../platform/admission';
import {getOidcConfig} from '../../../../auth/lib/config';
import {reviewOriginAllowed} from '../../../../kb/semantic/review-request';
import {IdentityStore} from '../../../../kb/identity/store';
import {failure,id,object} from '../../../../kb/identity/contract';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('identity_invalid_request');let size=0;const chunks:Uint8Array[]=[];while(true){const n=await reader.read();if(n.done)break;size+=n.value.byteLength;if(size>128*1024){await reader.cancel();throw Error('identity_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('identity_invalid_request');}}
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){let pool:Pool|undefined;try{const auth=await requireAuth('data.read');if(!auth.ok)return auth.response;const kbId=id((await ctx.params).id);if([...new URL(req.url).searchParams].length)throw Error('identity_invalid_request');if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))throw Error('identity_denied');if(!process.env.DATABASE_URL)throw Error('identity_unavailable');pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new IdentityStore(pool,async()=>(await userAdmission(auth.user)).allowed);if(req.method==='POST'){const c=object(await body(req));if(c.kbId!==kbId)throw Error('identity_invalid_request');return NextResponse.json(await store.command(who,c),{headers});}return NextResponse.json(await store.browse(who,kbId),{headers});}catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

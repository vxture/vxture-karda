import {NextResponse} from 'next/server';
import {requireAuth} from '../../../../kb/api/http';
import {userAdmission} from '../../../../platform/admission';
import {getOidcConfig} from '../../../../auth/lib/config';
import {reviewOriginAllowed} from '../../../../kb/semantic/review-request';
import {getObjectStore} from '../../../../kb/storage/objectstore';
import {ContributionStore} from '../../../../kb/contributions/store';
import {contributionPool,runtimeHandoff} from '../../../../kb/contributions/runtime';
import {id,obj,failure} from '../../../../kb/contributions/contract';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('contribution_invalid_request');const chunks:Uint8Array[]=[];let bytes=0;while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>128*1024){await reader.cancel();throw Error('contribution_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('contribution_invalid_request');}}
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){let pool:ReturnType<typeof contributionPool>|undefined;try{const auth=await requireAuth('data.read');if(!auth.ok)return auth.response;const kbId=id((await ctx.params).id),q=new URL(req.url).searchParams;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'origin_invalid'},{status:403,headers});pool=contributionPool();const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},admit=async()=>(await userAdmission(auth.user)).allowed,store=new ContributionStore(pool,getObjectStore(),admit);
 if(req.method==='POST'){if(q.size)throw Error('contribution_invalid_request');const c=obj(await body(req));if(c.kbId!==kbId)throw Error('contribution_invalid_request');return NextResponse.json(c.action==='prepare'?await runtimeHandoff(store).prepare(who,c):await store.command(who,c),{headers});}
 if([...q.keys()].some(k=>!['id','before','state'].includes(k)||q.getAll(k).length!==1))throw Error('contribution_invalid_request');return NextResponse.json(await store.browse(who,kbId,Object.fromEntries(q)),{headers});
 }catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

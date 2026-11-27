import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../../kb/api/http';
import {userAdmission} from '../../platform/admission';
import {getOidcConfig} from '../../auth/lib/config';
import {reviewOriginAllowed} from '../../kb/semantic/review-request';
import {getObjectStore} from '../../kb/storage/objectstore';
import {PostgresSemanticStore} from '../../kb/semantic/store-postgres';
import {ProductionStore} from '../../kb/production/store';
import {ProductionCoordinator} from '../../kb/production/coordinator';
import {failure,id} from '../../kb/production/contract';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('production_invalid_request');const chunks:Uint8Array[]=[];let bytes=0;while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>65536){await reader.cancel();throw Error('production_request_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('production_invalid_request');}}
async function handle(req:Request){let pool:Pool|undefined;try{const auth=await requireAuth('data.write');if(!auth.ok)return auth.response;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'origin_invalid'},{status:403,headers});if(!process.env.DATABASE_URL)throw Error('production_unavailable');
 const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},admit=async()=>(await userAdmission(auth.user)).allowed;pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,statement_timeout:15000,connectionTimeoutMillis:5000,allowExitOnIdle:true});const objects=getObjectStore(),store=new ProductionStore(pool,objects,admit),coordinator=new ProductionCoordinator(store,new PostgresSemanticStore(pool,objects,admit));const q=new URL(req.url).searchParams;
 if(req.method==='POST'){if(q.size)throw Error('production_invalid_request');return NextResponse.json(await coordinator.command(who,await body(req)),{headers});}
 if([...q.keys()].some(k=>!['id','before','kbId','state','historyBefore','documentBefore','unitId','assertionBefore'].includes(k)||q.getAll(k).length>1))throw Error('production_invalid_request');
 if(q.has('unitId')){if(!q.has('id')||[...q.keys()].some(k=>!['id','unitId','assertionBefore'].includes(k)))throw Error('production_invalid_request');return NextResponse.json(await coordinator.candidates(who,id(q.get('id')),id(q.get('unitId')),q.has('assertionBefore')?id(q.get('assertionBefore')):undefined),{headers});}
 if(q.has('assertionBefore')||q.has('historyBefore')&&(!q.has('id')||!/^[1-9][0-9]{0,9}$/.test(q.get('historyBefore')!)))throw Error('production_invalid_request');const raw=Object.fromEntries(q);return NextResponse.json(await store.browse(who,{...raw,...(q.has('historyBefore')?{historyBefore:Number(q.get('historyBefore'))}:{})}),{headers});
 }catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

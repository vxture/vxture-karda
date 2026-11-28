import {NextResponse} from 'next/server';
import {requireAuth} from '../api/http';
import {userAdmission} from '../../platform/admission';
import {getOidcConfig} from '../../auth/lib/config';
import {reviewOriginAllowed} from '../semantic/review-request';
import {getObjectStore} from '../storage/objectstore';
import {visualPool} from './runtime';
import {VisualStore} from './store';
import {visualSource} from './source';
import {visualHandoff} from './handoff';
import {readVisual,parseVisualRead} from './read';
import {command,failure,integer,id,box} from './contract';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function visualBody(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('visual_invalid_request');let bytes=0;const chunks:Uint8Array[]=[];while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.length;if(bytes>600000){await reader.cancel();throw Error('visual_request_budget');}chunks.push(n.value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('visual_invalid_request');}}
export async function visualHttp(req:Request,kbId:string,image=false){let pool;try{const auth=await requireAuth(image?'data.read':'data.write');if(!auth.ok)return auth.response;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'origin_invalid'},{status:403,headers});pool=visualPool();const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new VisualStore(pool,getObjectStore(),async()=>(await userAdmission(auth.user)).allowed),q=new URL(req.url).searchParams;
 if(image){if([...q.keys()].some(k=>!['assetId','versionId','region'].includes(k)||q.getAll(k).length!==1))throw Error('visual_invalid_request');const input=parseVisualRead({kb_ids:[kbId],asset_id:id(q.get('assetId')),version_id:id(q.get('versionId')),image:true,...(q.has('region')?{region:box(q.get('region')!.split(',').map(Number))}:{})});const out=await readVisual(store,who,input);if(!out.binary)throw Error('visual_image_unavailable');return new NextResponse(new Uint8Array(out.binary),{headers:{...headers,'Content-Type':'image/png','Content-Disposition':'inline'}});}
 if(req.method==='GET'){if([...q.keys()].some(k=>!['id','assetId','before','assetAfter'].includes(k)||q.getAll(k).length!==1))throw Error('visual_invalid_request');return NextResponse.json(await store.browse(who,kbId,{...(q.get('id')?{id:id(q.get('id'))}:{}),...(q.get('assetId')?{assetId:id(q.get('assetId'))}:{}),...(q.get('before')?{before:id(q.get('before'))}:{}),...(q.has('assetAfter')?{assetAfter:integer(Number(q.get('assetAfter')),0,300)}:{})}),{headers});}
 if(q.size)throw Error('visual_invalid_request');const c=command(await visualBody(req));if(c.action==='plan'){const source=await store.prepare(who,kbId,c.documentId),inventory=await visualSource('inventory',source.doc.mime,source.bytes);return NextResponse.json(await store.plan(who,kbId,c,inventory.locators,source.doc.content_hash),{headers});}if(c.action==='handoff')return NextResponse.json(await visualHandoff(store,who,kbId,c),{headers});return NextResponse.json(await store.mutate(who,kbId,c),{headers});
 }catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}

import {NextResponse} from 'next/server';
import {requireAuth} from '../../../../../kb/api/http';
import {userAdmission} from '../../../../../platform/admission';
import {getObjectStore} from '../../../../../kb/storage/objectstore';
import {VisualStore} from '../../../../../kb/visual/store';
import {visualPool} from '../../../../../kb/visual/runtime';
import {failure,id} from '../../../../../kb/visual/contract';
import {createHash} from 'node:crypto';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){let pool;const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};try{const auth=await requireAuth('data.write');if(!auth.ok)return auth.response;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['runId','assetId','revision'].includes(k)||q.getAll(k).length!==1))throw Error('visual_invalid_request');pool=visualPool();const kbId=(await ctx.params).id,who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new VisualStore(pool,getObjectStore(),async()=>(await userAdmission(auth.user)).allowed);const bytes=await store.tx(who,kbId,true,async db=>{const r=await store.run(db,kbId,id(q.get('runId')));await store.current(db,r);const a=await store.asset(db,r,id(q.get('assetId')));if(q.has('revision')&&String(a.revision)!==q.get('revision'))throw Error('visual_version_changed');if(!a.image_ref)throw Error('visual_image_unavailable');const b=await store.objects.get(a.image_ref);if(!b||b.length!==a.image_bytes||createHash('sha256').update(b).digest('hex')!==a.image_hash)throw Error('visual_image_unavailable');await store.current(db,r);return b;});return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'image/png'}});}catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}

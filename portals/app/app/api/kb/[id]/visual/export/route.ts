import {NextResponse} from 'next/server';
import {requireAuth} from '../../../../../kb/api/http';
import {userAdmission} from '../../../../../platform/admission';
import {getObjectStore} from '../../../../../kb/storage/objectstore';
import {VisualStore} from '../../../../../kb/visual/store';
import {visualPool} from '../../../../../kb/visual/runtime';
import {readVisual,parseVisualRead} from '../../../../../kb/visual/read';
import {failure,id} from '../../../../../kb/visual/contract';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){let pool;const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};try{const auth=await requireAuth('data.export');if(!auth.ok)return auth.response;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['assetId','versionId'].includes(k)||q.getAll(k).length!==1))throw Error('visual_invalid_request');pool=visualPool();const kbId=(await ctx.params).id,who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new VisualStore(pool,getObjectStore(),async()=>(await userAdmission(auth.user)).allowed);const out=await readVisual(store,who,parseVisualRead({kb_ids:[kbId],asset_id:id(q.get('assetId')),version_id:id(q.get('versionId')),export:true})),item=out.result.items[0];return NextResponse.json({format:'karda.visual-export.v1',assetId:item.assetId,sourceHash:item.contentHash,payload:item.payload,evidence:item},{headers});}catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}

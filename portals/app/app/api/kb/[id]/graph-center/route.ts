import {presentationPackage} from "../../../../kb/graph/presentation";
import {PostgresFormalSemanticLoader} from "../../../../kb/semantic/store-postgres";
import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../../../../kb/api/http';
import {userAdmission} from '../../../../platform/admission';
import {getOidcConfig} from '../../../../auth/lib/config';
import {reviewOriginAllowed} from '../../../../kb/semantic/review-request';
import {GraphStore} from '../../../../kb/graph/store';
import {failure,id,obj,restoreView,viewConfig} from '../../../../kb/graph/contract';
import {readKnowledgePackage} from '../../../../kb/semantic/knowledge-package';
import {inferCurrent} from '../../../../kb/graph/rules';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw Error('graph_invalid_request');let size=0;const chunks:Uint8Array[]=[];while(true){const n=await reader.read();if(n.done)break;size+=n.value.byteLength;if(size>256*1024){await reader.cancel();throw Error('graph_budget');}chunks.push(n.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){let pool:Pool|undefined;try{
 const auth=await requireAuth('data.read');if(!auth.ok)return auth.response;const kbId=id((await ctx.params).id),q=new URL(req.url).searchParams;
 if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))throw Error('graph_denied');
 if(!process.env.DATABASE_URL)throw Error('graph_unavailable');pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
 const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},admit=async()=>(await userAdmission(auth.user)).allowed,store=new GraphStore(pool,admit);
 if(req.method==='POST'){const c=obj(await body(req));if(c.kbId!==kbId)throw Error('graph_invalid_request');return NextResponse.json(await store.command(who,c),{headers});}
 if([...q.keys()].some(k=>!['assetId','mode','from','to'].includes(k)||q.getAll(k).length!==1))throw Error('graph_invalid_request');
 const assetId=q.has('assetId')?id(q.get('assetId')):undefined,mode=q.get('mode')??'list';
 if(mode==='schema')return NextResponse.json(await store.transaction(who,[kbId],false,async db=>({schema:(await new PostgresFormalSemanticLoader().load(db,[kbId])).schema})),{headers});
 if(mode==='diff'){
  return NextResponse.json(await store.transaction(who,[kbId],true,async db=>{
   const from=id(q.get('from')),to=id(q.get('to'));
   const releases=(await db.query('SELECT id,generation,payload FROM karda_kb.semantic_release WHERE kb_id=$1 AND id=ANY($2::uuid[])',[kbId,[from,to]])).rows;if(releases.length!==(from===to?1:2))throw Error('graph_invalid_request');
   const before=releases.find(r=>r.id===from)!,after=releases.find(r=>r.id===to)!;before.payload=before.payload.payload;after.payload=after.payload.payload;
   const a=new Map<string,unknown>((before.payload.relations??[]).map((r:any)=>[r.id,r])),b=new Map<string,unknown>((after.payload.relations??[]).map((r:any)=>[r.id,r]));
   const structural=(r:any)=>({id:r.id,type:r.type,sourceId:r.sourceId,targetId:r.targetId,assertionIds:r.assertionIds});
   return{from:{id:from,generation:before.generation},to:{id:to,generation:after.generation},added:[...b].filter(([k])=>!a.has(k)).map(([,r])=>structural(r)),removed:[...a].filter(([k])=>!b.has(k)).map(([,r])=>structural(r)),changed:[...b].filter(([k,r])=>a.has(k)&&JSON.stringify(r)!==JSON.stringify(a.get(k))).map(([k,r])=>({before:structural(a.get(k)),after:structural(r)})),sources:{before:before.payload.sources??[],after:after.payload.sources??[]},scope:'authorized_publication_metadata',impact:'direct_reference_only'};
  }),{headers});
 }
 const result=await store.browse(who,kbId,assetId);
 if(mode==='list')return NextResponse.json({...result,assets:result.assets.map(a=>a.created_by===who.sub?a:{id:a.id,kind:a.kind,title:a.title,visibility:a.visibility,state:a.state,active_version:a.active_version,created_by:a.created_by}),versions:assetId&&result.assets[0]?.created_by===who.sub?result.versions:[],history:result.history},{headers});
 if(!assetId||!['restore','export','infer'].includes(mode))throw Error('graph_invalid_request');
 const asset=result.assets.find(a=>a.id===assetId);if(!asset)throw Error('graph_denied');
 if(mode==='export')await store.transaction(who,[kbId],false,db=>store.access(who,db,[kbId],false,true));
 if(mode==='infer'){const pack=await readKnowledgePackage(who,{kbId,directory:true,query:{seedIds:['directory'],maxHops:0,maxNodes:100,maxEdges:200,pageCursor:''}},admit);return NextResponse.json({...await inferCurrent(pool,store,who,kbId,assetId,pack),knowledge:pack},{headers});}
 const active=result.versions.find(v=>v.id===asset.active_version);const raw=asset.created_by===who.sub?asset.draft:asset.state==='active'?active?.config:undefined;if(!raw||asset.kind==='rules')throw Error('graph_denied');
 const pack=await presentationPackage(pool,who,kbId,viewConfig(raw),admit,mode==='export');
 const restored=restoreView(viewConfig(raw),pack);const output={format:'karda.graph-presentation.v1',id:asset.id,title:asset.title,kind:asset.kind,...restored,knowledge:pack,checkedAt:new Date().toISOString(),scope:'current_authorized_selection'};
 if(mode==='export')return new Response(JSON.stringify(output,null,2),{headers:{...headers,'Content-Type':'application/json','Content-Disposition':'attachment; filename="graph-presentation.json"'}});
 return NextResponse.json(output,{headers});
 }catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}
export const GET=handle;export const POST=handle;

import {NextResponse} from 'next/server';
import {Pool} from 'pg';
import {requireAuth} from '../api/http';
import {userAdmission} from '../../platform/admission';
import {getOidcConfig} from '../../auth/lib/config';
import {reviewOriginAllowed} from '../semantic/review-request';
import {serviceBody} from '../services/http';
import {PublicKnowledge} from './store';
import {executePublicRead,publicOriginal} from './read';
import {publicError,obj,id} from './contract';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'};
export async function publicHttp(req:Request,original=false){let pool:Pool|undefined;try{const auth=await requireAuth('data.read');if(!auth.ok)return auth.response;if(req.method==='POST'&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json')))return NextResponse.json({error:'public_denied'},{status:403,headers});if(!process.env.DATABASE_URL)throw Error('public_unavailable');pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,statement_timeout:15000,connectionTimeoutMillis:5000,allowExitOnIdle:true});const who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[],productCode:'karda'},store=new PublicKnowledge(pool,async()=>(await userAdmission(auth.user)).allowed),p=new URL(req.url).searchParams;
if(original){if(req.method!=='GET'||[...p.keys()].some(k=>!['libraryId','releaseId','sourceId'].includes(k)||p.getAll(k).length!==1))throw Error('public_invalid_input');const bytes=await publicOriginal(store,who,id(p.get('libraryId')),id(p.get('releaseId')),id(p.get('sourceId')));return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="public-original.bin"'}});}
if(req.method==='POST'){if(p.size)throw Error('public_invalid_input');const c=obj(await serviceBody(req));if(c.action==='bind')return NextResponse.json(await store.bind(who,c),{headers});if(c.action==='feedback')return NextResponse.json(await store.feedback(who,c),{headers});if(c.action!=='read'||Object.keys(c).some(k=>!['action','requestId','input'].includes(k)))throw Error('public_invalid_input');const result=await executePublicRead(store,who,c.input,id(c.requestId));return NextResponse.json(result.body,{status:result.status,headers});}
if([...p.keys()].some(k=>!['id','before','domain','theme','region','nature','text','date'].includes(k)||p.getAll(k).length>1))throw Error('public_invalid_input');return NextResponse.json(await store.browse(who,Object.fromEntries(p)),{headers});}catch(e){const f=publicError(e);return NextResponse.json({error:f.code},{status:f.status,headers});}finally{await pool?.end();}}

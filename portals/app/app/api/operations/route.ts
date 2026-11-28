import {distributionOverview,triageFeedback} from '../../operations/lib/distribution';
/**
 * Operations management API; server-side authority and same-origin mutations.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {NextResponse} from 'next/server';
import {buildPublicIndex,queryPublicIndex} from '../../operations/lib/semantic';
import {changeRole,roleOverview,syncMembers} from '../../operations/lib/roles';
import {controlJob} from '../../operations/lib/job-control';
import {operatorContext,withOperatorAuthority} from '../../operations/lib/access';
import {operationsConfig} from '../../operations/lib/config';
import {overview,detail,execute,processJob,exportPublicLibrary} from '../../operations/lib/store';
export const dynamic='force-dynamic';
function failure(e:unknown){const code=e instanceof Error?e.message:'operations_unavailable';const status=code==='operations_unauthenticated'?401:['operations_forbidden','operations_not_associated'].includes(code)?403:code==='operations_not_found'?404:code==='operations_conflict'?409:code.startsWith('operations_')&&!['operations_not_configured','operations_unavailable','operations_authority_unavailable','operations_authority_not_integrated'].includes(code)?400:503;return NextResponse.json({error:status===503?'operations_unavailable':code},{status,headers:{'Cache-Control':'no-store'}});}
export async function GET(req:Request){try{const actor=await operatorContext(),u=new URL(req.url),id=u.searchParams.get('id');return await withOperatorAuthority(actor,async()=>NextResponse.json(u.searchParams.get('view')==='distribution'&&id?await distributionOverview(actor.sub,id):u.searchParams.get('view')==='roles'?await roleOverview(actor.sub):id?u.searchParams.get('export')==='true'?await exportPublicLibrary(actor.sub,id):await detail(actor.sub,id):await overview(actor.sub),{headers:{'Cache-Control':'no-store'}}));}catch(e){return failure(e);}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==operationsConfig().appOrigin)return NextResponse.json({error:'operations_forbidden'},{status:403});if(Number(req.headers.get('content-length')??0)>2*1024*1024)throw Error('operations_invalid_input');const actor=await operatorContext(),sub=actor.sub,raw=await req.text();if(Buffer.byteLength(raw)>2*1024*1024)throw Error('operations_invalid_input');const c=JSON.parse(raw);return await withOperatorAuthority(actor,async()=>NextResponse.json(c.action==='feedbackTriage'?await triageFeedback(sub,c):c.action==='syncMembers'?await syncMembers(sub):['roleSave','roleState','assignment'].includes(c.action)?await changeRole(sub,c):c.action==='jobControl'?await controlJob(actor,c):c.action==='queryIndex'?await queryPublicIndex(sub,c.id):c.action==='buildIndex'?await buildPublicIndex(sub,c.id):c.action==='runJob'?await processJob(sub,c.jobId):await execute(sub,c,undefined,actor),{headers:{'Cache-Control':'no-store'}}));}catch(e){return failure(e);}}

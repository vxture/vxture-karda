/**
 * Operations management API; server-side authority and same-origin mutations.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {NextResponse} from 'next/server';
import {buildPublicIndex} from '../../operations/lib/semantic';
import {bootstrap} from '../../operations/lib/bootstrap';
import {operator} from '../../operations/lib/access';
import {operationsConfig} from '../../operations/lib/config';
import {overview,detail,execute,processJob} from '../../operations/lib/store';
export const dynamic='force-dynamic';
function failure(e:unknown){const code=e instanceof Error?e.message:'operations_unavailable';const status=code==='operations_unauthenticated'?401:code==='operations_forbidden'?403:code==='operations_not_found'?404:code==='operations_conflict'?409:code.startsWith('operations_')&&!['operations_not_configured','operations_unavailable'].includes(code)?400:503;return NextResponse.json({error:status===503?'operations_unavailable':code},{status,headers:{'Cache-Control':'no-store'}});}
export async function GET(req:Request){try{const sub=await operator(),u=new URL(req.url),id=u.searchParams.get('id');return NextResponse.json(id?await detail(sub,id):await overview(sub),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==operationsConfig().appOrigin)return NextResponse.json({error:'operations_forbidden'},{status:403});if(Number(req.headers.get('content-length')??0)>2*1024*1024)throw Error('operations_invalid_input');const sub=await operator(),raw=await req.text();if(Buffer.byteLength(raw)>2*1024*1024)throw Error('operations_invalid_input');const c=JSON.parse(raw);return NextResponse.json(c.action==='buildIndex'?await buildPublicIndex(sub,c.id):c.action==='bootstrap'?await bootstrap(sub,c.secret):c.action==='runJob'?await processJob(sub,c.jobId):await execute(sub,c),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}

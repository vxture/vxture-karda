/**
 * Retained public source upload and authenticated original retrieval.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {NextResponse} from 'next/server';
import {createHash,randomUUID} from 'node:crypto';
import {operator,transaction} from '../../../operations/lib/access';
import {operationsConfig} from '../../../operations/lib/config';
import {execute} from '../../../operations/lib/store';
import {uuid} from '../../../operations/lib/contract';
import {getRawObjectStore} from '../../../kb/storage/objectstore';
import {visualSource} from '../../../kb/visual/source';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==operationsConfig().appOrigin)return new Response('forbidden',{status:403});const sub=await operator();await transaction(sub,'content.edit',async()=>true);
 if(Number(req.headers.get('content-length')??0)>9*1024*1024)return new Response('too large',{status:413});const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||file.size>8*1024*1024||!file.size)return new Response('invalid file',{status:400});
 const id=uuid(form.get('id')),artifactId=randomUUID(),bytes=Buffer.from(await file.arrayBuffer()),mime=file.type||'text/plain';let text='';
 if(['text/plain','text/markdown'].includes(mime)){text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n');}else if(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(mime)){const inventory=await visualSource('inventory',mime,bytes);text=inventory.locators.map(l=>l.nativeText).filter(Boolean).join('\n\n');if(!text.trim())throw Error('Native text unavailable; use reviewed transcription before importing');}else throw Error('Unsupported public source format');
 if(text.length>500000)throw Error('Public source text exceeds budget');const raw=await getRawObjectStore().put('product-karda',id,bytes);
 const result=await execute(sub,{action:'save',id,artifactId,kind:'source',expectedRevision:Number(form.get('revision')),note:form.get('note'),payload:{title:file.name,url:form.get('url'),issuer:form.get('issuer'),edition:form.get('edition'),validity:form.get('validity'),rights:form.get('rights'),text}},{key:raw.key,hash:raw.contentHash,bytes:raw.sizeBytes,mime});return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'operations_source_upload_failed'},{status:400});}}
export async function GET(req:Request){try{const sub=await operator(),u=new URL(req.url),id=uuid(u.searchParams.get('id')),sourceId=uuid(u.searchParams.get('source'));const original=await transaction(sub,'content.read',async db=>{const row=(await db.query("SELECT a.payload FROM karda_kb.public_artifact a JOIN karda_kb.public_library l ON l.id=a.library_id WHERE a.id=$1 AND a.library_id=$2 AND a.kind='source'",[sourceId,id])).rows[0];if(!row?.payload.original)throw Error();return row.payload.original as {key:string;hash:string;bytes:number;mime:string};});const bytes=await getRawObjectStore().get(original.key);if(!bytes||bytes.length!==original.bytes||createHash('sha256').update(bytes).digest('hex')!==original.hash)throw Error();return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="public-source.bin"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('unavailable',{status:403});}}

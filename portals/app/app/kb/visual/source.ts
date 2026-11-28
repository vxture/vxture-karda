import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {payload,type SourceLocator,type VisualPayload,transcript} from './contract';
import {atlasPost,type AtlasClientCore,type AtlasContext} from '../atlas/client';
let active=0;
export async function visualSource(mode:'inventory'|'render'|'crop',mime:string,bytes:Buffer,key=''):Promise<{locators:SourceLocator[];image:Buffer|null;width:number;height:number}>{
 if(!bytes.length||bytes.length>8*1024*1024)throw Error('visual_source_budget');if(active>=2)throw Error('visual_renderer_busy');active++;let folder:string|undefined;
 try{let script='';for(const p of ['source-tools/visual-source.py','../../source-tools/visual-source.py','../../scripts/knowledge/visual-source.py'])try{await access(resolve(process.cwd(),p));script=resolve(process.cwd(),p);break;}catch{}if(!script)throw Error('visual_renderer_unavailable');
 folder=await mkdtemp(join(tmpdir(),'karda-visual-'));const input=join(folder,'source.bin');await writeFile(input,bytes,{flag:'wx',mode:0o600});
 const out=await new Promise<string>((ok,fail)=>execFile(process.env.KARDA_KNOWLEDGE_PYTHON||'python3',['-I',script,mode,mime,input,folder!,key],{timeout:60000,maxBuffer:16*1024*1024,encoding:'utf8',windowsHide:true},(err,stdout)=>err?fail(Error('visual_source_refused')):ok(stdout)));
 const value=JSON.parse(out);if(mode==='inventory'){if(!Array.isArray(value)||value.length>300)throw Error('visual_inventory_budget');const locators=value.map((v:SourceLocator,i:number)=>{if(v.ordinal!==i+1||typeof v.key!=='string'||!['pdf_page','image','office_image','office_table'].includes(v.kind)||typeof v.nativeText!=='string'||v.nativeText.length>50000)throw Error('visual_inventory_invalid');return {...v,initial:payload(v.initial)};});if(new Set(locators.map(v=>v.key)).size!==locators.length)throw Error('visual_inventory_invalid');return{locators,image:null,width:0,height:0};}
 const image=value.image?await readFile(join(folder,'image.png')):null;if(image&&image.length>4*1024*1024)throw Error('visual_image_budget');return{locators:[],image,width:value.width??0,height:value.height??0};
 }finally{try{if(folder)await rm(folder,{recursive:true,force:true});}finally{active--;}}
}
export async function recognizeVisual(core:AtlasClientCore,context:AtlasContext,modelCode:string,key:string,image:Buffer):Promise<VisualPayload>{
 const r=await atlasPost(core,'/v1/parse',context,{task:'ocr',modelCode,taskId:key,workspaceId:context.ws,tenantId:context.org,applicationId:'karda',applicationType:'internal_service',pages:[{pageIndex:0,imageBase64:image.toString('base64')}]}) as {task?:string;modelCode?:string;pages?:{pageIndex:number;spans:{text:string;bbox:[number,number,number,number]}[]}[]};
 if(r.task!=='ocr'||r.modelCode!==modelCode||!Array.isArray(r.pages)||r.pages.length!==1||r.pages[0].pageIndex!==0||!Array.isArray(r.pages[0].spans))throw Error('visual_ocr_response_invalid');
 return payload({blocks:r.pages[0].spans.map((s,i)=>({...transcript(s.text,'ocr',s.bbox),id:'ocr_'+i})),blank:false,limitations:r.pages[0].spans.length?[]:['no_recognized_text']});
}

/**
 * Human-facing public source, evidence and relationship editing forms.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
'use client';
type Artifact={id:string;kind:string;payload:Record<string,unknown>};
export default function ArtifactEditor({kind,value,onChange,readOnly,artifacts}:{kind:string;value:string;onChange:(s:string)=>void;readOnly:boolean;artifacts:Artifact[]}){
 let p:Record<string,unknown>={};try{p=JSON.parse(value);}catch{}const change=(key:string,v:unknown)=>onChange(JSON.stringify({...p,[key]:v},null,2));
 const sources=artifacts.filter(a=>a.kind==='source'),items=artifacts.filter(a=>a.kind==='item');const source=sources.find(a=>a.id===p.sourceId);
 const input=(key:string,label:string,type='text')=><label className="block" key={key}>{label}<input type={type} readOnly={readOnly} value={String(p[key]??'')} onChange={e=>change(key,['start','end'].includes(key)?Number(e.target.value):e.target.value)} className="mt-1 w-full rounded border p-2"/></label>;
 const area=(key:string,label:string)=><label className="block" key={key}>{label}<textarea readOnly={readOnly} value={String(p[key]??'')} onChange={e=>change(key,e.target.value)} className="mt-1 h-28 w-full rounded border p-2"/></label>;
 const select=(key:string,label:string,options:{value:string;label:string}[])=><label className="block" key={key}>{label}<select disabled={readOnly} value={String(p[key]??'')} onChange={e=>{if(kind==='item'&&key==='sourceId'){const s=sources.find(a=>a.id===e.target.value);onChange(JSON.stringify({...p,sourceId:s?.id??'',sourceHash:s?.payload.contentHash??''},null,2));}else change(key,e.target.value);}} className="mt-1 w-full rounded border p-2"><option value="">请选择</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
 return <div className="space-y-3">{input('title','标题')}{kind==='source'&&<>{input('url','官方来源 URL','url')}{input('issuer','发布机构')}{input('edition','文号 / 来源版本')}{input('effective','生效日期（未知可留空）','date')}{select('validity','时效核验',[{value:'unknown',label:'待核验'},{value:'current',label:'当前有效'},{value:'historical',label:'历史版本'},{value:'withdrawn',label:'已失效 / 撤回'}])}{area('rights','再利用条件')}{area('text','规范化原文（引用位置按此文本计算）')}</>}
 {kind==='item'&&<>{area('statement','知识表述')}{input('category','业务主题 / 分类')}{select('nature','知识性质',[{value:'fact',label:'证据化事实'},{value:'explanation',label:'解释与方法'},{value:'checklist',label:'审查清单'},{value:'template',label:'参考模板'}])}{select('sourceId','依据来源',sources.map(a=>({value:a.id,label:String(a.payload.title)})))}{input('start','原文起始字符（从 0 计）','number')}{input('end','原文结束字符（不含）','number')}{source&&<details open><summary>原文与当前引用片段</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{String(source.payload.text)}</pre><blockquote className="my-2 rounded border p-2">{String(source.payload.text).slice(Number(p.start)||0,Number(p.end)||0)}</blockquote><p className="break-all">绑定来源哈希：{String(p.sourceHash??'未绑定')}</p></details>}{area('conditions','适用条件')}{area('exceptions','例外与未知事项')}</>}
 {kind==='relation'&&<>{select('sourceId','起点知识条目',items.map(a=>({value:a.id,label:String(a.payload.title)})))}{input('type','关系类型，如：规定义务 / 存在例外')}{select('targetId','终点知识条目',items.map(a=>({value:a.id,label:String(a.payload.title)})))}{select('evidenceId','关系依据来源',sources.map(a=>({value:a.id,label:String(a.payload.title)})))}</>}
 <details><summary>高级结构化数据</summary><textarea readOnly={readOnly} value={value} onChange={e=>onChange(e.target.value)} className="h-64 w-full rounded border p-2 font-mono" aria-label="知识对象 JSON"/></details></div>;
}

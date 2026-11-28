/**
 * Real public asset graph using the established G6 renderer.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
'use client';
import {useEffect,useRef,useState} from 'react';
export default function PublicGraph({data}:{data:{nodes:{id:string;label:string;kind:string}[];edges:{id:string;source:string;target:string;label:string}[]}}){const ref=useRef<HTMLDivElement>(null);const [error,setError]=useState('');useEffect(()=>{let destroyed=false;let instance:import('@antv/g6').Graph|undefined;void import('@antv/g6').then(async({Graph})=>{if(destroyed||!ref.current)return;instance=new Graph({container:ref.current,width:900,height:500,autoFit:'view',data:{nodes:data.nodes.map(n=>({...n,style:{labelText:n.label.slice(0,30),fill:n.kind==='source'?'#bfdbfe':'#bbf7d0'}})),edges:data.edges.map(e=>({...e,style:{labelText:e.label}}))},layout:{type:'force'},behaviors:['drag-canvas','zoom-canvas','drag-element']});await instance.render();}).catch(()=>setError('图谱渲染失败，可在下方关系清单检查真实数据。'));return()=>{destroyed=true;instance?.destroy();};},[data]);return <section><div ref={ref} className="h-[500px] max-w-full overflow-hidden rounded border"/>{error&&<p role="alert">{error}</p>}<p>{data.nodes.length} 个节点 · {data.edges.length} 条关系；蓝色为来源，绿色为知识条目。</p></section>;}

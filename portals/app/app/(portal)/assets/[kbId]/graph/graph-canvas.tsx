"use client";
import {useEffect,useRef,useState} from "react";
import type {Graph} from "@antv/g6";
import {Button} from "@vxture/design-system";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import type {GraphEntity,SemanticRelation} from "../../../../kb/semantic/contracts";
import type {GraphGroup} from "../../../../kb/semantic/graph-view";

/** G6 owns drawing, camera and layouts. The native catalog alongside this canvas
 * remains the keyboard/assistive-technology path for every authorized object. */
export function GraphCanvas({nodes,edges,groups,layoutMode,selected,edgeId,path,onNode,onEdge,positions,onCapture,onExport}:{
  nodes:GraphEntity[];edges:SemanticRelation[];groups:GraphGroup[];layoutMode:string;
  positions?:Record<string,{x:number;y:number}>;onCapture?:(p:Record<string,{x:number;y:number}>)=>void;onExport?:(fn:()=>Promise<string>)=>void;
  selected:string;edgeId:string;path:string[]|null;onNode:(id:string)=>void;onEdge:(id:string)=>void;
}){
  const m=useMessages(semantic),container=useRef<HTMLDivElement>(null),graph=useRef<Graph|null>(null);
  const current=useRef({selected,edgeId,path,onNode,onEdge,onCapture,onExport});current.current={selected,edgeId,path,onNode,onEdge,onCapture,onExport};
  const [state,setState]=useState<"loading"|"ready"|"failed">("loading"),[labels,setLabels]=useState("auto");
  const [zoom,setZoom]=useState(100);
  const showLabels=labels==="all"||(labels==="auto"&&nodes.length<=80);
  useEffect(()=>{
    let cancelled=false,instance:Graph|null=null;
    setState("loading");graph.current=null;
    void (async()=>{
      try{
        const {Graph}=await import("@antv/g6");if(cancelled||!container.current)return;
        const text=getComputedStyle(container.current).color;
        const grouped=layoutMode==="grouped";
        const membership=new Map(groups.flatMap((g,i)=>g.nodeIds.map(id=>[id,"combo-"+i] as const)));
        instance=new Graph({container:container.current,autoResize:true,animation:false,padding:48,
          data:{nodes:nodes.map(n=>({id:n.id,data:{label:n.label,type:n.type},...(positions?.[n.id]?{style:{x:positions[n.id].x,y:positions[n.id].y}}:{}),...(grouped?{combo:membership.get(n.id)}:{})})),
            edges:edges.map(e=>({id:e.id,source:e.sourceId,target:e.targetId,data:{label:e.type}})),
            ...(grouped?{combos:groups.filter(g=>g.nodeIds.some(id=>nodes.some(n=>n.id===id))).map(g=>({id:membership.get(g.nodeIds[0])!,data:{title:g.title??g.id}}))}:{})},
          node:{type:"circle",style:{size:36,fill:"#eef2ff",stroke:"#4f46e5",lineWidth:2,labelText:d=>String(d.data?.label??""),labelFill:text,labelPlacement:"bottom",labelVisibility:showLabels?"visible":"hidden"},
            state:{selected:{fill:"#c7d2fe",lineWidth:4,labelVisibility:"visible"}}},
          edge:{type:"line",style:{stroke:"#94a3b8",lineWidth:1.5,endArrow:true,labelText:d=>String(d.data?.label??""),labelFill:text,labelVisibility:"hidden"},
            state:{selected:{stroke:"#4f46e5",lineWidth:3,labelVisibility:"visible"},highlight:{stroke:"#d97706",lineWidth:3,labelVisibility:"visible"}}},
          combo:{type:"circle",style:{fill:"#f1f5f9",fillOpacity:.25,stroke:"#94a3b8",padding:24,labelText:d=>String(d.data?.title??""),labelFill:text}},
          layout:positions&&nodes.every(n=>positions[n.id])?undefined:layoutMode==="circular"?{type:"circular"}:grouped?{type:"combo-combined"}:{type:"force",preventOverlap:true,nodeSize:44},
          behaviors:["drag-canvas","zoom-canvas","drag-element"],
          plugins:[{type:"minimap",size:[160,100]}],
          transforms:["process-parallel-edges"],
        });
        const live=instance;
        live.on("node:click",event=>{if("target" in event&&event.target&&"id" in event.target)current.current.onNode(String(event.target.id));});
        live.on("edge:click",event=>{if("target" in event&&event.target&&"id" in event.target)current.current.onEdge(String(event.target.id));});
        live.on("afterlayout",()=>{if(!cancelled)current.current.onCapture?.(Object.fromEntries(nodes.map(n=>{const p=live.getElementPosition(n.id);return[n.id,{x:p[0],y:p[1]}];})));});
        live.on("node:dragend",()=>{if(!cancelled)current.current.onCapture?.(Object.fromEntries(nodes.map(n=>{const p=live.getElementPosition(n.id);return[n.id,{x:p[0],y:p[1]}];})));});
        live.on("aftertransform",()=>{if(!cancelled)setZoom(Math.round(live.getZoom()*100));});
        await live.render();if(cancelled)return;await live.fitView();if(cancelled)return;
        graph.current=live;current.current.onExport?.(()=>live.toDataURL({mode:"overall"}));setZoom(Math.round(live.getZoom()*100));setState("ready");
      }catch{if(!cancelled){graph.current=null;setState("failed");instance?.destroy();instance=null;}}
    })();
    return()=>{cancelled=true;graph.current=null;if(instance&&!instance.destroyed)instance.destroy();};
  },[nodes,edges,groups,layoutMode,showLabels,positions]);
  useEffect(()=>{
    const live=graph.current;if(state!=="ready"||!live)return;
    const highlighted=new Set(path??[]);
    const states=Object.fromEntries([...nodes.map(n=>[n.id,n.id===selected?["selected"]:[]]),
      ...edges.map(e=>[e.id,e.id===edgeId?["selected"]:highlighted.has(e.id)?["highlight"]:[]])]);
    void live.setElementState(states,false).then(()=>{
      const id=selected||edgeId;if(id&&!live.destroyed)return live.focusElement(id,false);
    }).catch(()=>{if(!live.destroyed)setState("failed");});
  },[selected,edgeId,path,nodes,edges,state]);
  function run(action:(g:Graph)=>Promise<void>){const live=graph.current;if(live)void action(live).catch(()=>{if(!live.destroyed)setState("failed");});}
  return <section className="min-w-0" aria-label={m.graphCanvas}>
    <div className="flex flex-wrap items-center gap-sm p-sm">
      <Button variant="outline" disabled={state!=="ready"} onClick={()=>run(g=>g.fitView())}>{m.resetView}</Button>
      <Button variant="outline" disabled={state!=="ready"} onClick={()=>run(g=>g.zoomTo(Math.min(8,g.getZoom()*1.25)))} aria-label={m.zoomIn}>+</Button>
      <Button variant="outline" disabled={state!=="ready"} onClick={()=>run(g=>g.zoomTo(Math.max(.05,g.getZoom()/1.25)))} aria-label={m.zoomOut}>-</Button>
      <label htmlFor="graph-labels">{m.graphLabels}</label><select id="graph-labels" value={labels} onChange={e=>setLabels(e.target.value)} className="rounded-md border border-border bg-background p-sm">
        <option value="auto">{m.graphLabelsAuto}</option><option value="all">{m.graphLabelsAll}</option><option value="focused">{m.graphLabelsFocused}</option>
      </select>
    </div>
    <p role="status" className="px-sm text-body-sm text-muted-foreground">{state==="loading"?m.layoutWorking:state==="failed"?m.graphEngineFailed:m.graphEngineReady} / {nodes.length} {m.graphNodes}, {edges.length} {m.relations} / {zoom}%</p>
    <div ref={container} role="img" tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget)return;
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","+","-","="].includes(e.key))return;e.preventDefault();
      if(e.key==="Home")run(g=>g.fitView());else if(e.key==="+"||e.key==="=")run(g=>g.zoomTo(Math.min(8,g.getZoom()*1.25)));
      else if(e.key==="-")run(g=>g.zoomTo(Math.max(.05,g.getZoom()/1.25)));
      else run(g=>g.translateBy([e.key==="ArrowLeft"?32:e.key==="ArrowRight"?-32:0,e.key==="ArrowUp"?32:e.key==="ArrowDown"?-32:0],false));
    }} aria-label={m.graphTitle} aria-describedby="graph-keyboard-help" className="h-[65vh] min-h-96 w-full overflow-hidden"/>
  </section>;
}

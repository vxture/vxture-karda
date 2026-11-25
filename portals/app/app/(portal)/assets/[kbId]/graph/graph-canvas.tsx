"use client";
import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {Button} from "@vxture/design-system";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {centerGraphCamera,defaultGraphCamera,graphCanvasPoint,graphViewport,visibleGraph,zoomGraphCamera,type GraphCamera,type GraphLayout} from "../../../../kb/semantic/graph-viewport";

export function GraphCanvas({layout,selected,edgeId,path,onNode,onEdge}:{layout:GraphLayout;selected:string;edgeId:string;path:string[]|null;onNode:(id:string)=>void;onEdge:(id:string)=>void}){
  const m=useMessages(semantic),svg=useRef<SVGSVGElement>(null);
  const [camera,setCamera]=useState(defaultGraphCamera),cameraRef=useRef(camera),frame=useRef<number|null>(null);
  const [dimensions,setDimensions]=useState({width:800,height:600}),[labels,setLabels]=useState("auto");
  const [nodeFocus,setNodeFocus]=useState(""),[edgeFocus,setEdgeFocus]=useState("");
  const refs=useRef(new Map<string,SVGElement>()),pendingFocus=useRef("");
  const drag=useRef<{pointer:number;x:number;y:number;camera:GraphCamera}|null>(null);
  const points=useMemo(()=>new Map(layout.points.map(p=>[p.id,p])),[layout]);
  const pathIds=useMemo(()=>new Set(path??[]),[path]);
  const activeNode=points.has(nodeFocus)?nodeFocus:layout.points[0]?.id;
  const activeEdge=layout.edges.some(e=>e.id===edgeFocus)?edgeFocus:layout.edges[0]?.id;
  const bounds=graphViewport(layout.size,dimensions.width,dimensions.height,camera);
  const rendered=visibleGraph(layout,bounds,[selected,activeNode??""],[edgeId,activeEdge??"",...pathIds]);
  const pixelScale=Math.min(dimensions.width,dimensions.height)/layout.size*camera.zoom;
  const labelSize=Math.min(18,Math.max(12,layout.size/90));
  const autoLabels=rendered.points.length<=80||labelSize*pixelScale>=10;
  const mapPath=useMemo(()=>layout.points.map(p=>`M${p.x} ${p.y}h.01`).join(" "),[layout]);

  function update(next:GraphCamera,batch=false){
    cameraRef.current=next;
    if(batch){if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setCamera(cameraRef.current);});}
    else{if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}setCamera(next);}
  }
  function center(point:{x:number;y:number}){update(centerGraphCamera(layout.size,cameraRef.current,point));}
  function centerEdge(id:string){const edge=layout.edges.find(e=>e.id===id);if(!edge)return;const a=points.get(edge.sourceId),b=points.get(edge.targetId);if(a&&b)center({x:(a.x+b.x)/2,y:(a.y+b.y)/2});}
  function canvasPoint(x:number,y:number){const rect=svg.current!.getBoundingClientRect();return graphCanvasPoint(layout.size,rect.width,rect.height,x-rect.left,y-rect.top);}
  function zoom(factor:number){update(zoomGraphCamera(layout.size,cameraRef.current,cameraRef.current.zoom*factor));}
  function navigate(e:KeyboardEvent<SVGElement>,kind:"node"|"edge",ids:string[],id:string){
    const delta=["ArrowRight","ArrowDown"].includes(e.key)?1:["ArrowLeft","ArrowUp"].includes(e.key)?-1:0;
    if(!ids.length||(!delta&&e.key!=="Home"&&e.key!=="End"))return;
    e.preventDefault();e.stopPropagation();
    const index=e.key==="Home"?0:e.key==="End"?ids.length-1:(ids.indexOf(id)+delta+ids.length)%ids.length,next=ids[index];
    pendingFocus.current=`${kind}/${next}`;
    if(kind==="node"){setNodeFocus(next);center(points.get(next)!);}else{setEdgeFocus(next);centerEdge(next);}
  }
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const resize=new ResizeObserver(([entry])=>setDimensions({width:entry.contentRect.width,height:entry.contentRect.height}));resize.observe(el);
    function wheel(e:WheelEvent){e.preventDefault();update(zoomGraphCamera(layout.size,cameraRef.current,cameraRef.current.zoom*Math.exp(-Math.max(-500,Math.min(500,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1)))*.002),canvasPoint(e.clientX,e.clientY)),true);}
    el.addEventListener("wheel",wheel,{passive:false});
    return()=>{resize.disconnect();el.removeEventListener("wheel",wheel);if(frame.current!==null)cancelAnimationFrame(frame.current);};
    // The parent remounts the canvas on scope or layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(selected&&points.has(selected))center(points.get(selected)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected]);
  useEffect(()=>{if(edgeId)centerEdge(edgeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[edgeId]);
  useEffect(()=>{const target=refs.current.get(pendingFocus.current);if(target){pendingFocus.current="";target.focus();}},[nodeFocus,edgeFocus,camera]);
  const mapLeft=Math.max(0,Math.min(layout.size,bounds.left)),mapTop=Math.max(0,Math.min(layout.size,bounds.top));
  const mapRight=Math.max(mapLeft,Math.min(layout.size,bounds.right)),mapBottom=Math.max(mapTop,Math.min(layout.size,bounds.bottom));
  return <section className="min-w-0" aria-label={m.graphCanvas}>
    <div className="flex flex-wrap items-center gap-sm p-sm">
      <Button variant="outline" onClick={()=>update(defaultGraphCamera())}>{m.resetView}</Button>
      <Button variant="outline" onClick={()=>zoom(1.25)} aria-label={m.zoomIn}>+</Button>
      <Button variant="outline" onClick={()=>zoom(1/1.25)} aria-label={m.zoomOut}>-</Button>
      <label htmlFor="graph-labels">{m.graphLabels}</label><select id="graph-labels" className="min-w-0 rounded-md border border-border bg-background p-sm" value={labels} onChange={e=>setLabels(e.target.value)}>
        <option value="auto">{m.graphLabelsAuto}</option><option value="all">{m.graphLabelsAll}</option><option value="focused">{m.graphLabelsFocused}</option>
      </select>
    </div>
    <p id="graph-render-status" role="status" className="px-sm text-body-sm text-muted-foreground">{m.graphViewportCount}: {rendered.points.length}/{layout.points.length} {m.graphNodes}, {rendered.edges.length}/{layout.edges.length} {m.relations} &middot; {Math.round(camera.zoom*100)}%</p>
    <svg ref={svg} viewBox={`0 0 ${layout.size} ${layout.size}`} role="group" aria-label={m.graphTitle} aria-describedby="graph-keyboard-help graph-render-status" tabIndex={0} className="h-[65vh] min-h-96 w-full touch-none focus-visible:outline focus-visible:outline-2"
      onKeyDown={e=>{if(e.target!==e.currentTarget)return;const step=layout.size/10,current=cameraRef.current;
        if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","+","-","="].includes(e.key)){e.preventDefault();
          if(e.key==="Home")update(defaultGraphCamera());else if(e.key==="+"||e.key==="=")zoom(1.25);else if(e.key==="-")zoom(1/1.25);
          else update({...current,x:current.x+(e.key==="ArrowLeft"?step:e.key==="ArrowRight"?-step:0),y:current.y+(e.key==="ArrowUp"?step:e.key==="ArrowDown"?-step:0)});
        }}}
      onPointerDown={e=>{if(e.button!==0||e.target!==e.currentTarget)return;const p=canvasPoint(e.clientX,e.clientY);drag.current={pointer:e.pointerId,...p,camera:cameraRef.current};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const start=drag.current;if(start?.pointer===e.pointerId){const p=canvasPoint(e.clientX,e.clientY);update({...start.camera,x:start.camera.x+p.x-start.x,y:start.camera.y+p.y-start.y},true);}}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
      <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
      <g transform={`translate(${camera.x+layout.size/2} ${camera.y+layout.size/2}) scale(${camera.zoom}) translate(${-layout.size/2} ${-layout.size/2})`}>
        {rendered.edges.map(edge=>{const a=points.get(edge.sourceId)!,b=points.get(edge.targetId)!,active=edge.id===edgeId||pathIds.has(edge.id);return <g key={edge.id}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={active?5:2} opacity={active?1:.35} markerEnd="url(#graph-arrow)"/>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="18" role="button" tabIndex={activeEdge===edge.id?0:-1}
            ref={el=>{if(el)refs.current.set(`edge/${edge.id}`,el);else refs.current.delete(`edge/${edge.id}`);}} className="focus-visible:stroke-primary focus-visible:opacity-100"
            aria-pressed={edge.id===edgeId} onFocus={()=>{setEdgeFocus(edge.id);centerEdge(edge.id);}} aria-label={`${a.label} ${edge.type} ${b.label}`}
            onClick={()=>onEdge(edge.id)} onKeyDown={e=>{navigate(e,"edge",layout.edges.map(v=>v.id),edge.id);if(e.key==="Enter"||e.key===" "){e.preventDefault();onEdge(edge.id);}}}/>
        </g>;})}
        {rendered.points.map(node=><g key={node.id} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={activeNode===node.id?0:-1} aria-label={node.label} aria-pressed={selected===node.id}
          ref={el=>{if(el)refs.current.set(`node/${node.id}`,el);else refs.current.delete(`node/${node.id}`);}} className="focus-visible:outline focus-visible:outline-2"
          onFocus={()=>{setNodeFocus(node.id);center(node);}} onClick={()=>{center(node);onNode(node.id);}} onKeyDown={e=>{navigate(e,"node",layout.points.map(v=>v.id),node.id);if(e.key==="Enter"||e.key===" "){e.preventDefault();onNode(node.id);}}}>
          <circle r={selected===node.id?23:17} fill={selected===node.id?"currentColor":"var(--background, white)"} stroke="currentColor" strokeWidth="3"/>
          {(labels==="all"||(labels==="auto"&&autoLabels)||selected===node.id||nodeFocus===node.id)&&<text y="-30" textAnchor="middle" fill="currentColor" fontSize={labelSize}>{node.label.slice(0,26)}</text>}
          <title>{node.label} / {node.type}</title>
        </g>)}
      </g>
    </svg>
    <div className="flex flex-wrap items-center gap-sm border-t border-border p-sm">
      <svg viewBox={`0 0 ${layout.size} ${layout.size}`} role="group" aria-label={m.graphMap} aria-describedby="graph-map-help" tabIndex={0} className="h-36 w-36 shrink-0 touch-none rounded-md border border-border focus-visible:outline focus-visible:outline-2"
        onPointerDown={e=>{if(e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect(),p=graphCanvasPoint(layout.size,rect.width,rect.height,e.clientX-rect.left,e.clientY-rect.top);center({x:Math.max(0,Math.min(layout.size,p.x)),y:Math.max(0,Math.min(layout.size,p.y))});}}
        onKeyDown={e=>{if(e.key==="Home"){e.preventDefault();update(defaultGraphCamera());}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const current=cameraRef.current,step=layout.size/10*current.zoom;update({...current,x:current.x+(e.key==="ArrowLeft"?step:e.key==="ArrowRight"?-step:0),y:current.y+(e.key==="ArrowUp"?step:e.key==="ArrowDown"?-step:0)});}}}>
        <path d={mapPath} fill="none" stroke="currentColor" strokeWidth={layout.size/80} strokeLinecap="round" opacity=".5"/>
        <rect x={mapLeft} y={mapTop} width={mapRight-mapLeft} height={mapBottom-mapTop} fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeWidth={layout.size/120}/>
      </svg>
      <p id="graph-map-help" className="min-w-0 max-w-[28rem] flex-1 basis-[16rem] text-body-sm text-muted-foreground">{m.graphMapHint}</p>
    </div>
  </section>;
}

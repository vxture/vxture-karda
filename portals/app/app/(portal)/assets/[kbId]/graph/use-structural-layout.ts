"use client";
import {useEffect,useState} from "react";
import type {GraphEntity,SemanticRelation} from "../../../../kb/semantic/contracts";
import {validLayoutCoordinates,type LayoutCoordinates} from "../../../../kb/semantic/structural-layout";

type Job={nodes:GraphEntity[];edges:SemanticRelation[];state:"ready";value:LayoutCoordinates}|{nodes:GraphEntity[];edges:SemanticRelation[];state:"failed"};

export function useStructuralLayout(nodes:GraphEntity[],edges:SemanticRelation[],enabled:boolean){
  const [job,setJob]=useState<Job|null>(null);
  useEffect(()=>{
    setJob(null);
    if(!enabled||!nodes.length)return;
    let active=true,worker:Worker|undefined;
    const fail=()=>{if(active){active=false;clearTimeout(timeout);worker?.terminate();setJob({nodes,edges,state:"failed"});}};
    const timeout=setTimeout(fail,10000);
    try{
      worker=new Worker(new URL("./layout.worker.ts",import.meta.url));
      worker.onmessage=event=>{
        if(!active)return;
        if(event.data?.ok===true&&validLayoutCoordinates(event.data.value,nodes.map(n=>n.id))){
          active=false;clearTimeout(timeout);worker?.terminate();setJob({nodes,edges,state:"ready",value:event.data.value});
        }else fail();
      };
      worker.onerror=event=>{event.preventDefault();fail();};worker.onmessageerror=fail;
      worker.postMessage({ids:nodes.map(n=>n.id),links:edges.map(e=>({sourceId:e.sourceId,targetId:e.targetId}))});
    }catch{fail();}
    return()=>{active=false;clearTimeout(timeout);worker?.terminate();};
  },[nodes,edges,enabled]);
  const current=enabled&&job?.nodes===nodes&&job.edges===edges?job:null;
  const value=current?.state==="ready"?current.value:null;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  return {pending:enabled&&nodes.length>0&&!current,failed:current?.state==="failed",
    layout:value?{size:value.size,points:value.points.map(p=>({...byId.get(p.id)!,x:p.x,y:p.y})),edges}:null};
}

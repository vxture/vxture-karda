import type {GraphEntity,SemanticRelation} from "./contracts";

/** Linear-time deterministic circular layout; caller supplies only authorized nodes. */
export function layoutGraph(nodes:GraphEntity[],edges:SemanticRelation[]) {
  const ids=new Set(nodes.map(n=>n.id));
  if(nodes.length>500||edges.length>1000||ids.size!==nodes.length)throw new Error("semantic_graph_budget");
  const ordered=[...nodes].sort((a,b)=>a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
  const radius=Math.max(220,ordered.length*4),center=radius+120;
  return {size:center*2,points:ordered.map((n,i)=>({...n,
    x:center+radius*Math.cos(i*2*Math.PI/Math.max(1,ordered.length)),
    y:center+radius*Math.sin(i*2*Math.PI/Math.max(1,ordered.length))})),
    edges:edges.filter(e=>ids.has(e.sourceId)&&ids.has(e.targetId))};
}

/** Undirected discovery path, preserving each business edge's actual direction. */
export function graphPath(nodes:GraphEntity[],edges:SemanticRelation[],from:string,to:string):string[]|null {
  const allowed=new Set(nodes.map(n=>n.id));
  if(!allowed.has(from)||!allowed.has(to))return null;
  if(from===to)return [];
  const neighbors=new Map<string,{id:string;edge:string}[]>();
  for(const e of [...edges].sort((a,b)=>a.id.localeCompare(b.id))){
    if(!allowed.has(e.sourceId)||!allowed.has(e.targetId))continue;
    for(const [a,b] of [[e.sourceId,e.targetId],[e.targetId,e.sourceId]]){
      const rows=neighbors.get(a)??[];rows.push({id:b,edge:e.id});neighbors.set(a,rows);
    }
  }
  const seen=new Set([from]),queue=[from],previous=new Map<string,{id:string;edge:string}>();
  for(let i=0;i<queue.length;i++)for(const next of neighbors.get(queue[i])??[]){
    if(seen.has(next.id))continue;seen.add(next.id);previous.set(next.id,{id:queue[i],edge:next.edge});
    if(next.id===to){const result:string[]=[];let cursor=to;
      while(cursor!==from){const p=previous.get(cursor)!;result.push(p.edge);cursor=p.id;}return result.reverse();}
    queue.push(next.id);
  }
  return null;
}

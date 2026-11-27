import type {GraphEntity,SemanticRelation} from "./contracts";

export interface GraphGroup {title?:string;id:string;nodeIds:string[];edgeIds:string[]}

/** Bounded deterministic local modularity optimization over authorized topology.
 * Undirected simple edges guide navigation only; business directions stay intact. */
export function graphCommunities(nodes:GraphEntity[],edges:SemanticRelation[]):GraphGroup[]{
  graphGroups(nodes,edges); // shared hard budget and identity validation
  const ids=[...nodes.map(n=>n.id)].sort(),neighbors=new Map(ids.map(id=>[id,new Set<string>()]));
  for(const edge of edges){
    if(edge.sourceId===edge.targetId||!neighbors.has(edge.sourceId)||!neighbors.has(edge.targetId))continue;
    neighbors.get(edge.sourceId)!.add(edge.targetId);neighbors.get(edge.targetId)!.add(edge.sourceId);
  }
  const degree=new Map(ids.map(id=>[id,neighbors.get(id)!.size])),totalDegree=[...degree.values()].reduce((a,b)=>a+b,0);
  if(!totalDegree)return graphGroups(nodes,edges);
  const membership=new Map(ids.map(id=>[id,id])),totals=new Map(degree);
  for(let pass=0;pass<20;pass++){
    let changed=false;
    for(const id of ids){
      const current=membership.get(id)!,d=degree.get(id)!;if(!d)continue;
      totals.set(current,totals.get(current)!-d);
      const links=new Map<string,number>();
      for(const next of neighbors.get(id)!){const group=membership.get(next)!;links.set(group,(links.get(group)??0)+1);}
      const score=(group:string)=>(links.get(group)??0)-d*(totals.get(group)??0)/totalDegree;
      let best=current,bestScore=score(current);
      for(const group of [...links.keys()].sort()){
        const value=score(group);
        if(value>bestScore+1e-12){best=group;bestScore=value;}
      }
      membership.set(id,best);totals.set(best,(totals.get(best)??0)+d);if(best!==current)changed=true;
    }
    if(!changed)break;
  }
  const groups=new Map<string,GraphGroup>();
  for(const id of ids){const key=membership.get(id)!,group=groups.get(key)??{id,nodeIds:[],edgeIds:[]};group.nodeIds.push(id);groups.set(key,group);}
  for(const edge of edges){const a=membership.get(edge.sourceId),b=membership.get(edge.targetId);if(a!==undefined&&a===b)groups.get(a)!.edgeIds.push(edge.id);}
  return [...groups.values()].map(g=>({...g,id:g.nodeIds[0],edgeIds:g.edgeIds.sort()})).sort((a,b)=>b.nodeIds.length-a.nodeIds.length||a.id.localeCompare(b.id));
}

/** Connected components of this authorized projection, never a whole-corpus claim. */
export function graphGroups(nodes:GraphEntity[],edges:SemanticRelation[]):GraphGroup[]{
  const ids=new Set(nodes.map(n=>n.id));
  if(nodes.length>500||edges.length>1000||ids.size!==nodes.length)throw new Error("semantic_graph_budget");
  const adjacent=new Map(nodes.map(n=>[n.id,[] as string[]]));
  const eligible=edges.filter(e=>ids.has(e.sourceId)&&ids.has(e.targetId));
  for(const e of eligible){adjacent.get(e.sourceId)!.push(e.targetId);adjacent.get(e.targetId)!.push(e.sourceId);}
  const seen=new Set<string>(),groups:GraphGroup[]=[],membership=new Map<string,GraphGroup>();
  for(const id of [...ids].sort()){
    if(seen.has(id))continue;
    const queue=[id];seen.add(id);
    for(let i=0;i<queue.length;i++)for(const next of adjacent.get(queue[i])!){
      if(!seen.has(next)){seen.add(next);queue.push(next);}
    }
    const group={id,nodeIds:queue.sort(),edgeIds:[] as string[]};groups.push(group);
    for(const member of queue)membership.set(member,group);
  }
  for(const edge of eligible)membership.get(edge.sourceId)!.edgeIds.push(edge.id);
  for(const group of groups)group.edgeIds.sort();
  return groups.sort((a,b)=>b.nodeIds.length-a.nodeIds.length||a.id.localeCompare(b.id));
}

/** Pack component circles in separate cells; bounded and independent of input order. */
export function layoutGroupedGraph(nodes:GraphEntity[],edges:SemanticRelation[],communities=false){
  const groups=communities?graphCommunities(nodes,edges):graphGroups(nodes,edges),byId=new Map(nodes.map(n=>[n.id,n]));
  const columns=Math.max(1,Math.ceil(Math.sqrt(groups.length)));
  const cell=Math.max(400,...groups.map(g=>Math.max(100,g.nodeIds.length*4)*2+160));
  const rows=Math.max(1,Math.ceil(groups.length/columns)),size=Math.max(columns,rows)*cell;
  const centers=groups.map((group,i)=>({...group,x:(i%columns+.5)*cell,y:(Math.floor(i/columns)+.5)*cell}));
  const points=centers.flatMap(group=>{
    const radius=group.nodeIds.length===1?0:Math.max(100,group.nodeIds.length*4);
    return group.nodeIds.map((id,i)=>({...byId.get(id)!,x:group.x+radius*Math.cos(i*2*Math.PI/group.nodeIds.length),
      y:group.y+radius*Math.sin(i*2*Math.PI/group.nodeIds.length)}));
  });
  const ids=new Set(nodes.map(n=>n.id));
  return {size,points,edges:edges.filter(e=>ids.has(e.sourceId)&&ids.has(e.targetId)),groups:centers};
}

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

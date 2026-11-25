export interface LayoutTopology {ids:string[];links:{sourceId:string;targetId:string}[]}
export interface LayoutCoordinates {size:number;points:{id:string;x:number;y:number}[]}

/** Bounded, deterministic force layout. Only topology enters the worker. */
export function structuralLayout(input:LayoutTopology):LayoutCoordinates{
  if(!Array.isArray(input.ids)||!Array.isArray(input.links)||input.ids.length>500||input.links.length>1000||
    input.ids.some(id=>typeof id!=="string"||!id||id.length>128)||new Set(input.ids).size!==input.ids.length)
    throw new Error("semantic_layout_budget");
  const ids=[...input.ids].sort(),index=new Map(ids.map((id,i)=>[id,i]));
  const links=new Map<string,[number,number]>(),adjacent=ids.map(()=>[] as number[]);
  for(const edge of input.links){
    if(!edge||typeof edge.sourceId!=="string"||typeof edge.targetId!=="string")throw new Error("semantic_layout_topology");
    const a=index.get(edge.sourceId),b=index.get(edge.targetId);
    if(a===undefined||b===undefined)throw new Error("semantic_layout_topology");
    if(a===b)continue;
    const lo=Math.min(a,b),hi=Math.max(a,b);links.set(`${lo}/${hi}`,[lo,hi]);
  }
  const pairs=[...links.values()].sort(([a,b],[c,d])=>a-c||b-d);
  for(const [a,b] of pairs){adjacent[a].push(b);adjacent[b].push(a);}
  const seen=new Set<number>(),components:number[][]=[];
  for(let i=0;i<ids.length;i++){
    if(seen.has(i))continue;
    const component=[i];seen.add(i);
    for(let j=0;j<component.length;j++)for(const next of adjacent[component[j]])if(!seen.has(next)){seen.add(next);component.push(next);}
    components.push(component.sort((a,b)=>a-b));
  }
  components.sort((a,b)=>b.length-a.length||a[0]-b[0]);
  const columns=Math.max(1,Math.ceil(Math.sqrt(components.length))),cell=Math.max(320,Math.ceil(Math.sqrt(components[0]?.length??1))*150+180);
  const size=Math.max(columns,Math.ceil(components.length/columns))*cell;
  const points:LayoutCoordinates["points"]=[];
  for(let c=0;c<components.length;c++){
    const members=components[c],local=new Map(members.map((id,i)=>[id,i])),count=members.length;
    const springs=pairs.filter(([a,b])=>local.has(a)&&local.has(b)).map(([a,b])=>[local.get(a)!,local.get(b)!]);
    const positions=members.map((_,i)=>{const radius=Math.sqrt(i+.5)*75,angle=i*2.399963229728653;return {x:radius*Math.cos(angle),y:radius*Math.sin(angle)};});
    for(let iteration=0;iteration<120&&count>1;iteration++){
      const forces=positions.map(p=>({x:-p.x*.008,y:-p.y*.008}));
      for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
        const dx=positions[i].x-positions[j].x,dy=positions[i].y-positions[j].y,factor=12100/Math.max(25,dx*dx+dy*dy);
        forces[i].x+=dx*factor;forces[i].y+=dy*factor;forces[j].x-=dx*factor;forces[j].y-=dy*factor;
      }
      for(const [a,b] of springs){
        const dx=positions[b].x-positions[a].x,dy=positions[b].y-positions[a].y,length=Math.max(1,Math.hypot(dx,dy)),factor=(length-110)*.12/length;
        forces[a].x+=dx*factor;forces[a].y+=dy*factor;forces[b].x-=dx*factor;forces[b].y-=dy*factor;
      }
      const temperature=24*(1-iteration/120)+.5;
      for(let i=0;i<count;i++){
        const length=Math.max(1,Math.hypot(forces[i].x,forces[i].y)),step=Math.min(length,temperature)/length;
        positions[i].x+=forces[i].x*step;positions[i].y+=forces[i].y*step;
      }
    }
    const minX=Math.min(...positions.map(p=>p.x)),maxX=Math.max(...positions.map(p=>p.x)),minY=Math.min(...positions.map(p=>p.y)),maxY=Math.max(...positions.map(p=>p.y));
    const scale=(cell-180)/Math.max(1,maxX-minX,maxY-minY),cx=(c%columns+.5)*cell,cy=(Math.floor(c/columns)+.5)*cell;
    for(let i=0;i<count;i++)points.push({id:ids[members[i]],x:cx+(positions[i].x-(minX+maxX)/2)*scale,y:cy+(positions[i].y-(minY+maxY)/2)*scale});
  }
  return {size,points:points.sort((a,b)=>a.id.localeCompare(b.id))};
}

export function validLayoutCoordinates(value:unknown,ids:readonly string[]):value is LayoutCoordinates{
  if(!value||typeof value!=="object")return false;
  const v=value as LayoutCoordinates,allowed=new Set(ids);
  return Number.isFinite(v.size)&&v.size>=1&&v.size<=1000000&&Array.isArray(v.points)&&v.points.length===ids.length&&
    new Set(v.points.map(p=>p?.id)).size===ids.length&&v.points.every(p=>p&&allowed.has(p.id)&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=v.size&&p.y<=v.size);
}

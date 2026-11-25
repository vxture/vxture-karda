import type {GraphEntity,SemanticRelation} from "./contracts";

export interface GraphCamera {zoom:number;x:number;y:number}
export interface GraphBounds {left:number;top:number;right:number;bottom:number}
export interface GraphPoint extends GraphEntity {x:number;y:number}
export interface GraphLayout {size:number;points:GraphPoint[];edges:SemanticRelation[]}

export const GRAPH_MIN_ZOOM=.2,GRAPH_MAX_ZOOM=16;
export const defaultGraphCamera=():GraphCamera=>({zoom:1,x:0,y:0});

/** SVG's default xMidYMid meet includes letterboxing on either axis. */
export function graphCanvasPoint(size:number,width:number,height:number,x:number,y:number){
  const scale=size/Math.max(1,Math.min(width,height));
  return {x:size/2+(x-width/2)*scale,y:size/2+(y-height/2)*scale};
}

export function graphViewport(size:number,width:number,height:number,camera:GraphCamera):GraphBounds{
  const a=graphCanvasPoint(size,width,height,0,0),b=graphCanvasPoint(size,width,height,width,height);
  const world=(v:number,offset:number)=>(v-size/2-offset)/camera.zoom+size/2;
  return {left:world(a.x,camera.x),top:world(a.y,camera.y),right:world(b.x,camera.x),bottom:world(b.y,camera.y)};
}

export function centerGraphCamera(size:number,camera:GraphCamera,point:{x:number;y:number}):GraphCamera{
  return {zoom:camera.zoom,x:(size/2-point.x)*camera.zoom,y:(size/2-point.y)*camera.zoom};
}

/** Keep the graph point under the mouse fixed while zooming. */
export function zoomGraphCamera(size:number,camera:GraphCamera,zoom:number,anchor={x:size/2,y:size/2}):GraphCamera{
  const next=Math.max(GRAPH_MIN_ZOOM,Math.min(GRAPH_MAX_ZOOM,zoom)),ratio=next/camera.zoom;
  return {zoom:next,x:anchor.x-size/2-(anchor.x-size/2-camera.x)*ratio,
    y:anchor.y-size/2-(anchor.y-size/2-camera.y)*ratio};
}

function inside(p:{x:number;y:number},b:GraphBounds){return p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;}

/** Liang-Barsky: retain crossing relations even if both endpoints are off-screen. */
export function graphSegmentVisible(a:{x:number;y:number},b:{x:number;y:number},bounds:GraphBounds){
  let low=0,high=1;
  const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-bounds.left],[dx,bounds.right-a.x],[-dy,a.y-bounds.top],[dy,bounds.bottom-a.y]]){
    if(p===0){if(q<0)return false;continue;}
    const t=q/p;
    if(p<0)low=Math.max(low,t);else high=Math.min(high,t);
    if(low>high)return false;
  }
  return true;
}

/** Rendering selection only: never discovers or fetches additional knowledge. */
export function visibleGraph(layout:GraphLayout,bounds:GraphBounds,pinnedNodes:readonly string[]=[],pinnedEdges:readonly string[]=[],margin=260){
  const expanded={left:bounds.left-margin,top:bounds.top-margin,right:bounds.right+margin,bottom:bounds.bottom+margin};
  const points=new Map(layout.points.map(p=>[p.id,p])),nodes=new Set(pinnedNodes),edges=new Set(pinnedEdges);
  return {points:layout.points.filter(p=>nodes.has(p.id)||inside(p,expanded)),edges:layout.edges.filter(e=>{
    const a=points.get(e.sourceId),b=points.get(e.targetId);
    return Boolean(a&&b&&(edges.has(e.id)||graphSegmentVisible(a,b,expanded)));
  })};
}

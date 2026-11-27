import type {GraphProjection,KnowledgeSnapshot,OntologySchema,AuthorizedReadScope} from '../semantic/contracts';
import {projectDirectory} from '../semantic/projection';
/** Reuse source/current-authority gates; collect all eligible pages before any graph engine traversal. */
export function eligibleGraph(snapshot:KnowledgeSnapshot,schema:OntologySchema,scope:AuthorizedReadScope):GraphProjection{
 const nodes=new Map(),edges=new Map(),assertions=new Map(),evidence=new Map();let cursor='',pages=0;
 do{const page=projectDirectory(snapshot,schema,scope,{maxNodes:500,maxEdges:1000,pageCursor:cursor});
   for(const [target,rows]of [[nodes,page.nodes],[edges,page.edges],[assertions,page.assertions],[evidence,page.evidence]] as const)for(const row of rows)target.set(row.id,row);
   if(nodes.size>5000||edges.size>5000||++pages>50)throw Error('graph_budget');
   cursor=page.directoryPage?.nextCursor??'';
 }while(cursor);
 return{schema:{namespace:schema.namespace,schemaId:schema.schemaId,version:schema.version},nodes:[...nodes.values()],edges:[...edges.values()],assertions:[...assertions.values()],evidence:[...evidence.values()],truncated:false};
}
export function selectGraph(graph:GraphProjection,ids:string[],maxNodes:number,maxEdges:number):GraphProjection{
 const nodes=new Set<string>(),edges:GraphProjection['edges']=[];let truncated=false;const byId=new Map(graph.edges.map(e=>[e.id,e]));
 for(const id of ids){const e=byId.get(id);if(!e)throw Error('graph_index_changed');const count=new Set([...nodes,e.sourceId,e.targetId]).size;if(edges.length>=maxEdges||count>maxNodes){truncated=true;continue;}edges.push(e);nodes.add(e.sourceId);nodes.add(e.targetId);}
 const assertions=new Set(edges.flatMap(e=>e.assertionIds)),proofs=new Set(graph.assertions.filter(a=>assertions.has(a.id)).flatMap(a=>a.evidenceIds));
 return{schema:graph.schema,nodes:graph.nodes.filter(n=>nodes.has(n.id)),edges,assertions:graph.assertions.filter(a=>assertions.has(a.id)),evidence:graph.evidence.filter(e=>proofs.has(e.id)),truncated};
}

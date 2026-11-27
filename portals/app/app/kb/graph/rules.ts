import type {Pool} from 'pg';
import type {SemanticReadIdentity,KnowledgePackage} from '../semantic/read-postgres';
import {GraphStore,parseRules} from './store';
import {jenaCommand} from './client';
import {projectRdf,schemaType} from '../semantic/rdf-projection';
import {hash} from './contract';
import type {OntologySchema} from '../semantic/contracts';
export async function inferCurrent(pool:Pool,store:GraphStore,who:SemanticReadIdentity,kbId:string,assetId:string,graph:KnowledgePackage){
 return store.transaction(who,[kbId],false,async db=>{
  const row=(await db.query("SELECT a.active_version,v.config,v.config_hash FROM karda_kb.graph_asset a JOIN karda_kb.graph_asset_version v ON v.id=a.active_version AND v.asset_id=a.id WHERE a.id=$1 AND a.workspace_id=$2 AND a.kb_id=$3 AND a.kind='rules' AND a.state='active' AND (a.created_by=$4 OR a.visibility='workspace')",[assetId,who.workspaceId,kbId,who.sub])).rows[0];if(!row)throw Error('graph_denied');
  const config=parseRules(row.config);if(hash(config)!==row.config_hash||JSON.stringify([config.schema.namespace,config.schema.schemaId,config.schema.version])!==JSON.stringify([graph.schema.namespace,graph.schema.schemaId,graph.schema.version]))throw Error('graph_rule_invalid');
  const rdf=projectRdf(graph,config.schema);
  const iri=(v:string)=>'<'+v+'>';
  const hierarchy=config.hierarchy.map(h=>iri(schemaType(config.schema,'class',h.child))+' <http://www.w3.org/2000/01/rdf-schema#subClassOf> '+iri(schemaType(config.schema,'class',h.parent))+' .').join('\n');
  const constraints=config.constraints.map((c,i)=>'_:extra'+i+' <http://www.w3.org/ns/shacl#targetClass> '+iri(schemaType(config.schema,'relation',c.relationType))+' .\n_:extra'+i+' <http://www.w3.org/ns/shacl#property> _:support'+i+' .\n_:support'+i+' <http://www.w3.org/ns/shacl#path> <urn:karda:vocab:assertion> .\n_:support'+i+' <http://www.w3.org/ns/shacl#minCount> "'+c.minSupport+'"^^<http://www.w3.org/2001/XMLSchema#integer> .').join('\n');
  const result=await jenaCommand({operation:'infer',data:rdf.data+'\n'+hierarchy,shapes:rdf.shapes+'\n'+constraints,rules:config.rules});
  if(!Array.isArray(result.inferences)||result.inferences.length>500)throw Error('graph_unavailable');
  const edgeMap=new Map(graph.edges.map(e=>[e.id,e])),nodeMap=new Map(graph.nodes.map(n=>[n.id,n]));
  const inferences=result.inferences.map((value:unknown)=>{const x=value as {source:string;target:string;type:string;premiseIds:string[];ruleIds:string[]};
   const sourceId=x.source.split(':').at(-1)!,targetId=x.target.split(':').at(-1)!,definition=config.schema.relationTypes.find(t=>t.id===x.type);
   if(!definition||!nodeMap.has(sourceId)||!nodeMap.has(targetId)||!definition.sourceTypes.includes(nodeMap.get(sourceId)!.type)||!definition.targetTypes.includes(nodeMap.get(targetId)!.type)||!x.premiseIds.length||x.premiseIds.length>32||!x.premiseIds.every(p=>edgeMap.has(p.split(':').at(-1)!))||!x.ruleIds.every(r=>config.rules.some(rule=>rule.id===r)))throw Error('graph_rule_invalid');
   const premiseIds=x.premiseIds.map(p=>p.split(':').at(-1)!),assertionIds=[...new Set(premiseIds.flatMap(p=>edgeMap.get(p)!.assertionIds))];
   return{id:hash([row.active_version,sourceId,targetId,x.type,premiseIds]),origin:'inferred',sourceId,targetId,type:x.type,ruleVersion:row.active_version,ruleIds:x.ruleIds,premiseIds,assertionIds,evidenceIds:[...new Set(graph.assertions.filter(a=>assertionIds.includes(a.id)).flatMap(a=>a.evidenceIds))]};
  });return{engine:'apache-jena',version:'6.3.0',ruleVersion:row.active_version,scope:'current_authorized_window',inferences,truncated:result.truncated===true,baseTruncated:graph.truncated};
 });
}

import {createHash} from "node:crypto";
import type {GraphProjection,OntologySchema} from "./contracts";
import {validateOntology} from "./projection";

const RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SH="http://www.w3.org/ns/shacl#";
const XSD="http://www.w3.org/2001/XMLSchema#";
export const KARDA_RDF="urn:karda:vocab:";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const iri=(value:string)=>"<"+value+">";
const lit=(value:string)=>{
  if(typeof value!=="string"||value.length>10000||!value.isWellFormed())throw new Error("semantic_rdf_invalid_literal");
  return '"'+value.replace(/["\\\u0000-\u001f\u007f]/g,c=>c==='"'?'\\"':c==='\\'?'\\\\':"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))+'"';
};
export function resource(kind:"entity"|"relation"|"assertion"|"evidence"|"source",kb:string,id:string){
  if(!uuid.test(kb)||!uuid.test(id))throw new Error("semantic_rdf_invalid_identity");
  return "urn:karda:"+kind+":"+kb+":"+id;
}
const schemaType=(schema:OntologySchema,kind:string,id:string)=>"urn:karda:schema:"+
  [schema.namespace,schema.schemaId,schema.version,kind,id].map(encodeURIComponent).join(":");
export interface RdfProjection {format:"karda.rdf-projection.v1";fingerprint:string;data:string;shapes:string;nodes:number;edges:number;partial:boolean}
/** Accept only the current authorized projection from PostgresSemanticReader.
 * This mapping does not grant access and must never receive raw table candidates. */
export function projectRdf(graph:GraphProjection,schema:OntologySchema):RdfProjection{
  validateOntology(schema);
  if(graph.schema.namespace!==schema.namespace||graph.schema.schemaId!==schema.schemaId||graph.schema.version!==schema.version||
    graph.nodes.length>500||graph.edges.length>1000)throw new Error("semantic_rdf_scope");
  const triples:string[]=[],shapes:string[]=[];
  const add=(s:string,p:string,o:string)=>triples.push(iri(s)+" "+iri(p)+" "+o+" .");
  const shape=(s:string,p:string,o:string)=>shapes.push(s+" "+iri(SH+p)+" "+o+" .");
  let seq=0;
  const property=(parent:string,path:string,values:Record<string,string>)=>{const b="_:p"+seq++;shape(parent,"property",b);shape(b,"path",iri(path));for(const [k,v]of Object.entries(values))shape(b,k,v);return b;};
  const integer=(n:number)=>lit(String(n))+"^^"+iri(XSD+"integer");
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  if(nodes.size!==graph.nodes.length)throw new Error("semantic_rdf_scope");
  const assertionMap=new Map(graph.assertions.map(a=>[a.id,a]));
  const evidenceMap=new Map(graph.evidence.map(e=>[e.id,e]));
  for(const n of graph.nodes){
    if(!schema.entityTypes.includes(n.type))throw new Error("semantic_rdf_unknown_type");
    const s=resource("entity",n.kbId,n.id);
    add(s,RDF+"type",iri(KARDA_RDF+"Entity"));add(s,RDF+"type",iri(schemaType(schema,"class",n.type)));
    add(s,"http://www.w3.org/2000/01/rdf-schema#label",lit(n.label));
  }
  for(const a of graph.assertions){
    const s=resource("assertion",a.kbId,a.id);add(s,RDF+"type",iri(KARDA_RDF+"Assertion"));
    for(const id of a.evidenceIds){const e=evidenceMap.get(id);if(e&&e.kbId===a.kbId&&e.stance==="supports")add(s,KARDA_RDF+"evidence",iri(resource("evidence",e.kbId,e.id)));}
  }
  for(const e of graph.evidence){
    const s=resource("evidence",e.kbId,e.id);add(s,RDF+"type",iri(KARDA_RDF+"Evidence"));
    add(s,KARDA_RDF+"source",iri(resource("source",e.kbId,e.documentId)));
    add(s,KARDA_RDF+"sourceVersion",integer(e.documentVersion));add(s,KARDA_RDF+"start",integer(e.start));add(s,KARDA_RDF+"end",integer(e.end));
  }
  const edgeIds=new Set<string>();
  for(const e of graph.edges){
    if(edgeIds.has(e.id)||!schema.relationTypes.some(t=>t.id===e.type)||nodes.get(e.sourceId)?.kbId!==e.kbId||nodes.get(e.targetId)?.kbId!==e.kbId||
      !e.assertionIds.length||e.assertionIds.some(id=>assertionMap.get(id)?.kbId!==e.kbId)||e.origin!=="asserted"||
      JSON.stringify([e.schema.namespace,e.schema.schemaId,e.schema.version])!==JSON.stringify([schema.namespace,schema.schemaId,schema.version]))throw new Error("semantic_rdf_scope");
    edgeIds.add(e.id);const s=resource("relation",e.kbId,e.id);
    add(s,RDF+"type",iri(KARDA_RDF+"Relation"));add(s,RDF+"type",iri(schemaType(schema,"relation",e.type)));
    add(s,KARDA_RDF+"source",iri(resource("entity",e.kbId,e.sourceId)));add(s,KARDA_RDF+"target",iri(resource("entity",e.kbId,e.targetId)));
    add(s,KARDA_RDF+"origin",lit(e.origin));add(s,KARDA_RDF+"relationType",lit(e.type));
    for(const id of e.assertionIds)add(s,KARDA_RDF+"assertion",iri(resource("assertion",e.kbId,id)));
  }
  const root="_:relation";shape(root,"targetClass",iri(KARDA_RDF+"Relation"));
  property(root,KARDA_RDF+"source",{minCount:integer(1),maxCount:integer(1),class:iri(KARDA_RDF+"Entity")});
  property(root,KARDA_RDF+"target",{minCount:integer(1),maxCount:integer(1),class:iri(KARDA_RDF+"Entity")});
  property(root,KARDA_RDF+"assertion",{minCount:integer(1),class:iri(KARDA_RDF+"Assertion")});
  property(root,KARDA_RDF+"origin",{hasValue:lit("asserted"),maxCount:integer(1)});
  shape("_:assertion","targetClass",iri(KARDA_RDF+"Assertion"));property("_:assertion",KARDA_RDF+"evidence",{minCount:integer(1),class:iri(KARDA_RDF+"Evidence")});
  for(const type of schema.relationTypes){
    const s="_:type"+seq++;shape(s,"targetClass",iri(schemaType(schema,"relation",type.id)));
    for(const [path,types]of [["source",type.sourceTypes],["target",type.targetTypes]] as const){
      const p=property(s,KARDA_RDF+path,{});
      // Standard RDF list of sh:class alternatives. No custom validator.
      const cells=types.map(()=>"_:list"+seq++),branches=types.map(()=>"_:branch"+seq++);
      shape(p,"or",cells[0]);
      types.forEach((id,i)=>{shapes.push(cells[i]+" "+iri(RDF+"first")+" "+branches[i]+" .");shapes.push(cells[i]+" "+iri(RDF+"rest")+" "+(cells[i+1]??iri(RDF+"nil"))+" .");shape(branches[i],"class",iri(schemaType(schema,"class",id)));});
    }
  }
  const data=[...new Set(triples)].sort().join("\n")+"\n",constraints=shapes.join("\n")+"\n";
  if(Buffer.byteLength(data)+Buffer.byteLength(constraints)>1536*1024)throw new Error("semantic_rdf_budget");
  return{format:"karda.rdf-projection.v1",fingerprint:createHash("sha256").update("karda.rdf.v1\n"+data+constraints).digest("hex"),data,shapes:constraints,nodes:graph.nodes.length,edges:graph.edges.length,partial:graph.truncated};
}

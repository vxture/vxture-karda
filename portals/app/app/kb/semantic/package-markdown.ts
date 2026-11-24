import type {KnowledgePackage} from "./read-postgres";
const text=(value:string)=>value.replace(/[\\`*_{}\[\]()#+.!|<>-]/g,"\\$&").replace(/[\r\n]+/g," ");

/** Portable, deterministic projection. No embedded HTML or executable links. */
export function packageMarkdown(input:KnowledgePackage):string {
  const label=(id:string)=>input.nodes.find(n=>n.id===id)?.label??id;
  const lines=["# Published knowledge",`Schema: ${text(input.schema.namespace)} / ${text(input.schema.schemaId)} / ${text(input.schema.version)}`,"",
    "This is an exported snapshot. Recheck current authorization, sources and publication before reuse.",""];
  if(input.gaps.length)lines.push(`Gaps: ${input.gaps.map(text).join(", ")}`,"");
  lines.push("## Entities",...input.nodes.map(n=>`- ${text(n.label)} (${n.id})`),"");
  for(const edge of input.edges){
    lines.push(`## ${text(label(edge.sourceId))} -> ${text(edge.type)} -> ${text(label(edge.targetId))}`,`Relation: ${edge.id}`,"");
    for(const id of edge.assertionIds){
      lines.push(text(input.statements.find(s=>s.id===id)?.statement??id),"");
      const assertion=input.assertions.find(a=>a.id===id);
      for(const e of input.evidence.filter(e=>assertion?.evidenceIds.includes(e.id))){
        lines.push(`> ${text(input.passages.find(p=>p.evidenceId===e.id)?.excerpt??"")}`,
          `Source: ${e.documentId} / v${e.documentVersion} / UTF-16 ${e.start}:${e.end}`,"");
      }
    }
  }
  return lines.join("\n")+"\n";
}

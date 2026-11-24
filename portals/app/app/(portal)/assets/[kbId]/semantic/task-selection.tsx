"use client";

import {useState} from "react";
import {Button} from "@vxture/design-system";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import type {Compilation,CompilerSnapshot} from "../../../../kb/semantic/compiler";
import type {CompileTaskRow} from "../../../../_lib/semantic-api";

export function TaskSelection({task,busy,onSubmit}:{task:CompileTaskRow;busy:boolean;
  onSubmit:(ids:string[],note:string)=>void}) {
  const m=useMessages(semantic),[selected,setSelected]=useState<string[]>([]),[note,setNote]=useState("");
  const compilation=task.result.compilation as Compilation|undefined;
  const entities=(task.context?.entities??[]) as CompilerSnapshot["entities"];
  const assertions=(task.context?.assertions??[]) as CompilerSnapshot["assertions"];
  if(!compilation)return null;
  const label=(id:string)=>entities.find(e=>e.id===id)?.name??id;
  function toggle(id:string,checked:boolean) {
    const alternatives=compilation!.conflicts.find(g=>g.relationIds.includes(id))?.relationIds??[];
    setSelected(old=>checked?[...old.filter(x=>!alternatives.includes(x)),id]:old.filter(x=>x!==id));
  }
  return <details className="w-full"><summary>{m.selectCandidates}</summary>
    <p className="text-body-sm text-muted-foreground">{m.selectionHint}</p>
    <ul className="text-body-sm">{compilation.rejected.map(issue=><li key={issue.index}>
      {m.rejectedItems} {issue.index+1}: {issue.reason}
    </li>)}</ul>
    {compilation.payload.relations.map(relation=><div key={relation.id} className="my-sm rounded-md border border-border p-sm">
      <label className="flex items-center gap-sm break-words text-body-sm">
        <input type="checkbox" disabled={busy} checked={selected.includes(relation.id)}
          onChange={event=>toggle(relation.id,event.target.checked)}/>
        {label(relation.sourceId)} &rarr; {relation.type} &rarr; {label(relation.targetId)}
      </label>
      {compilation.conflicts.some(g=>g.relationIds.includes(relation.id))&&<p className="text-body-sm">{m.alternativeGroups}</p>}
      {assertions.filter(a=>relation.assertionIds.includes(a.id)).map(a=><blockquote key={a.id} className="border-l-2 border-border pl-sm text-body-sm">
        <p>{a.statement}</p>{a.evidence.map((e,i)=><div key={i}><p className="break-words">{e.excerpt}</p>
          <p className="break-all font-mono text-code-sm">{e.documentId} / v{e.version} / {e.start}:{e.end}</p></div>)}
      </blockquote>)}
    </div>)}
    {compilation.payload.relations.length===0?<p className="text-body-sm">{m.noSelectable}</p>:<>
      <label htmlFor={`selection-note-${task.id}`} className="text-body-sm">{m.note}</label>
      <textarea id={`selection-note-${task.id}`} value={note} maxLength={10000} disabled={busy}
        onChange={e=>setNote(e.target.value)} className="min-h-20 w-full rounded-md border border-border bg-background p-sm text-body-sm"/>
      <Button disabled={busy||!selected.length||!note.trim()||!task.resultHash} onClick={()=>onSubmit(selected,note)}>{m.submitSelection}</Button>
    </>}
  </details>;
}

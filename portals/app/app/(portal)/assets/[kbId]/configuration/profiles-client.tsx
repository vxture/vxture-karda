"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {profiles} from "../../../../_i18n/messages/profiles";
import {SignInGate} from "../../../../_lib/ui";
import {validateCompileProfile,type CompileProfile,type ProfileCommand} from "../../../../kb/semantic/profile-config";
import type {ProfileResult,ProfileVersion} from "../../../../kb/semantic/profile-store";

export function ProfilesClient({kbId}:{kbId:string}){
  const m=useMessages(profiles),[value,setValue]=useState<ProfileResult|null>(null),[selected,setSelected]=useState<ProfileVersion|null>(null),
    [busy,setBusy]=useState(false),[error,setError]=useState(0),[invalid,setInvalid]=useState(false),[saved,setSaved]=useState(false),[confirm,setConfirm]=useState(false);
  const [title,setTitle]=useState(""),[schemaId,setSchemaId]=useState("domain-relations"),[version,setVersion]=useState("1"),[types,setTypes]=useState(""),[relations,setRelations]=useState(""),[mapping,setMapping]=useState(""),[note,setNote]=useState("");
  const seq=useRef(0),abort=useRef<AbortController|null>(null),locked=useRef(false),pending=useRef<ProfileCommand|null>(null);
  const endpoint=`/api/kb/${encodeURIComponent(kbId)}/compile-profiles`;
  useEffect(()=>{void load();return()=>{seq.current++;abort.current?.abort();};},[]);
  function edit(){pending.current=null;setSaved(false);setInvalid(false);setConfirm(false);}
  function copy(p:CompileProfile){
    edit();setSchemaId(p.schema.schemaId);setVersion(p.schema.version);setTypes(p.schema.entityTypes.join("\n"));
    setRelations(p.schema.relationTypes.map(r=>`${r.id} | ${r.sourceTypes.join(",")} | ${r.targetTypes.join(",")}`).join("\n"));
    setMapping(p.entityTypes.map(r=>`${r.kind} = ${r.type}`).join("\n"));
  }
  async function json(url:string,signal:AbortSignal,command?:ProfileCommand){
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal,...(command?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}:{})});
    if(!response.ok)throw {status:response.status};return response.json();
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(locked.current)return;locked.current=true;const ticket=++seq.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;
    setBusy(true);setError(0);setSaved(false);
    try{await work(ctl.signal);}catch(e){if(ticket===seq.current){const status=(e as {status?:number}).status??503;setError(status);setValue(null);setSelected(null);setConfirm(false);
      if([400,401,403,409].includes(status))pending.current=null;}}
    finally{if(ticket===seq.current){setBusy(false);locked.current=false;}}
  }
  async function load(query=""){
    setValue(null);setSelected(null);setConfirm(false);pending.current=null;
    await run(async signal=>{const result=await json(endpoint+query,signal);if(result.format!=="karda.compile-profiles.v1"||result.kbId!==kbId)throw Error("invalid_response");setValue(result);});
  }
  function definition():CompileProfile{
    const lines=(s:string)=>s.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),split=(s:string)=>s.split(",").map(v=>v.trim());
    return validateCompileProfile({schema:{namespace:"karda.config",schemaId,version,entityTypes:lines(types),relationTypes:lines(relations).map(line=>{
      const parts=line.split("|").map(v=>v.trim());if(parts.length!==3)throw Error("invalid");return {id:parts[0],sourceTypes:split(parts[1]),targetTypes:split(parts[2])};})},
      entityTypes:lines(mapping).map(line=>{const parts=line.split("=").map(v=>v.trim());if(parts.length!==2)throw Error("invalid");return {kind:parts[0],type:parts[1]};})});
  }
  async function save(){
    let command:ProfileCommand;
    try{command=pending.current?.action==="save"?pending.current:{action:"save",id:crypto.randomUUID(),title:title.trim(),definition:definition()};}catch{setInvalid(true);return;}
    pending.current=command;
    await run(async signal=>{const result=await json(endpoint,signal,command);const page=await json(`${endpoint}?id=${result.id}`,signal);setValue(page);setSelected(page.versions[0]??null);pending.current=null;setConfirm(false);setSaved(true);});
  }
  async function activate(profileId:string|null){
    if(!value&&pending.current?.action!=="activate")return;
    const command:ProfileCommand=pending.current?.action==="activate"?pending.current:{action:"activate",eventId:crypto.randomUUID(),profileId,expectedRevision:value!.revision,note:note.trim()};
    pending.current=command;
    await run(async signal=>{await json(endpoint,signal,command);setValue(await json(endpoint,signal));setSelected(null);pending.current=null;setConfirm(false);setNote("");setSaved(true);});
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/configuration`}/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><p>{m.hint}</p><p>{m.localOnly}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.refresh}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/semantic`}>{m.compile}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graph}</Link></Button></div>
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.conflict:error===400?m.invalid:m.unavailable}/>}
    {saved&&<Banner tone="success" title={m.saved}/>}{invalid&&<Banner tone="danger" title={m.invalid}/>}
    {error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void(pending.current?.action==="save"?save():activate(pending.current!.action==="activate"?pending.current!.profileId:null))}>{m.retry}</Button>}
    {value&&<>
      <section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.current}</h2>
        <p className="break-all">{value.current.schema.namespace} / {value.current.schema.schemaId} / {value.current.schema.version} / {m.revision}: {value.revision}</p>
        <p>{value.activeId??m.bootstrap}</p><p>{m.newOnly}</p>
        {!!value.unmappedKinds.length&&<Banner tone="warning" title={`${m.unmapped}: ${value.unmappedKinds.join(", ")}`}/>}
        <Button variant="outline" disabled={busy} onClick={()=>copy(value.current)}>{m.copyCurrent}</Button>
      </section>
      <section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.versions}</h2>{!value.versions.length&&<p>{m.empty}</p>}
        {value.versions.map(row=><article key={row.id} className="grid min-w-0 gap-sm rounded border p-sm"><p className="break-words">{row.title} / {row.definition.schema.schemaId} / {row.definition.schema.version}</p>
          <small className="break-all">{row.id} / {row.created_at}</small><div className="flex flex-wrap gap-sm">
            <Button variant="outline" disabled={busy} onClick={()=>{edit();setSelected(row);}}>{m.inspect}</Button>
            <Button variant="outline" disabled={busy} onClick={()=>{copy(row.definition);setTitle(row.title);}}>{m.copy}</Button></div></article>)}
        {value.nextBefore&&<Button variant="outline" disabled={busy} onClick={()=>void load(`?before=${value.nextBefore}`)}>{m.more}</Button>}
        {selected&&<><h3>{m.inspect}: {selected.title}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border p-sm">{JSON.stringify(selected.definition,null,2)}</pre></>}
        <label>{m.note}<textarea className="block w-full rounded border p-sm" rows={3} maxLength={10000} value={note} onChange={e=>{edit();setNote(e.target.value);}}/></label>
        <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> {m.confirm}</label>
        <div className="flex flex-wrap gap-sm"><Button disabled={busy||!selected||!note.trim()||!confirm} onClick={()=>void activate(selected!.id)}>{m.activate}</Button>
          <Button variant="outline" disabled={busy||!value.activeId||!note.trim()||!confirm} onClick={()=>void activate(null)}>{m.restore}</Button></div>
      </section>
      <section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.create}</h2>
        <label>{m.label}<input maxLength={200} className="block w-full rounded border p-sm" value={title} onChange={e=>{edit();setTitle(e.target.value);}}/></label>
        <label>{m.schemaId}<input maxLength={64} className="block w-full rounded border p-sm" value={schemaId} onChange={e=>{edit();setSchemaId(e.target.value);}}/></label>
        <label>{m.version}<input maxLength={63} className="block w-full rounded border p-sm" value={version} onChange={e=>{edit();setVersion(e.target.value);}}/></label>
        <label>{m.types}<textarea rows={4} className="block w-full rounded border p-sm" value={types} onChange={e=>{edit();setTypes(e.target.value);}}/></label>
        <label>{m.relations}<textarea rows={5} className="block w-full rounded border p-sm" value={relations} onChange={e=>{edit();setRelations(e.target.value);}}/></label>
        <label>{m.mapping}<textarea rows={6} className="block w-full rounded border p-sm" value={mapping} onChange={e=>{edit();setMapping(e.target.value);}}/></label>
        <p>{m.syntax}</p><Button disabled={busy||!title.trim()} onClick={()=>void save()}>{m.save}</Button>
      </section>
      <section className="grid min-w-0 gap-sm"><h2>{m.history}</h2>{value.history.map(row=><article key={row.revision} className="rounded border p-sm">
        <p className="break-all">{m.revision} {row.revision} / {row.profile_id??m.bootstrap} / {row.created_at} / {row.created_by}</p><p className="whitespace-pre-wrap break-words">{row.note}</p>
      </article>)}{value.nextHistoryBefore&&<Button variant="outline" disabled={busy} onClick={()=>void load(`?historyBefore=${value.nextHistoryBefore}`)}>{m.earlier}</Button>}</section>
    </>}
  </div>;
}

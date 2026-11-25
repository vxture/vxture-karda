"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {SourceSearchResult} from "../../../../kb/retrieval/source-search";

export function SourceSearchClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),[query,setQuery]=useState(""),[tier,setTier]=useState("verified_and_untracked");
  const [data,setData]=useState<SourceSearchResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState("");
  const sequence=useRef(0);
  useEffect(()=>()=>{sequence.current++;},[]);
  async function search(){
    const ticket=++sequence.current;setBusy(true);setData(null);setError(0);setCode("");
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/source-search`,{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({query:query.trim(),verification_filter:tier,top_k:20})});
      const body=await response.json();if(ticket!==sequence.current)return;
      if(!response.ok){setError(response.status);setCode(body.error??"");return;}setData(body);
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/sources`}/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.sourceSearchTitle}/>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graphTitle}</Link></Button></div>
    <p className="text-body-sm text-muted-foreground">{m.sourceSearchHint}</p>
    <form onSubmit={e=>{e.preventDefault();void search();}} className="flex flex-col gap-sm">
      <label htmlFor="source-query">{m.sourceQuery}</label><input id="source-query" required maxLength={500} value={query} onChange={e=>setQuery(e.target.value)} disabled={busy} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      <label htmlFor="source-tier">{m.sourceVerification}</label><select id="source-tier" value={tier} disabled={busy} onChange={e=>setTier(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm">
        <option value="verified_and_untracked">{m.sourceDefaultTier}</option><option value="verified_only">{m.sourceVerifiedOnly}</option><option value="all">{m.sourceAllTier}</option>
      </select><Button type="submit" disabled={busy||!query.trim()}>{m.sourceSearchAction}</Button>
    </form>
    {busy&&<p role="status">{m.loading}</p>}
    {!!error&&<div role="alert"><Banner tone="danger" title={error===403?m.packageDenied:code==="source_search_budget"?m.sourceBudget:code==="usage_unavailable"?m.sourceUsageUnavailable:m.sourceSearchUnavailable}/></div>}
    {data&&<>
      {data.partial&&<Banner tone="warning" title={m.sourcePartial}/>}
      {data.truncated&&<Banner tone="warning" title={m.sourceTopLimit}/>}
      <p role="status" className="text-body-sm">{data.searchedDocuments} {m.sourceDocuments} / {data.searchedPassages} {m.sourcePassages} / {data.matchedPassages} {m.passageMatches}</p>
      {!data.items.length&&<p>{m.sourceNoMatches}</p>}
      {data.items.map(item=><Card key={`${item.documentId}:${item.documentVersion}:${item.start}:${item.end}`}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <h2 className="break-words text-title-sm">{item.title}</h2>
        <p className="text-body-sm">{item.verificationState==="verified"?m.sourceVerified:item.verificationState==="stale"?m.sourceStale:m.sourceUnverified}</p>
        <blockquote className="whitespace-pre-wrap break-words border-l-2 border-border pl-sm text-body-sm">{item.text}</blockquote>
        <p className="break-all font-mono text-code-sm">{item.documentId} / v{item.documentVersion} / UTF-16 {item.start}:{item.end}{item.pages.length?` / ${m.sourcePages} ${item.pages.join(", ")}`:""}</p>
        <details><summary>{m.sourceFingerprint}</summary><p className="break-all font-mono text-code-sm">SHA-256 {item.contentHash}</p></details>
      </CardContent></Card>)}
    </>}
  </div>;
}

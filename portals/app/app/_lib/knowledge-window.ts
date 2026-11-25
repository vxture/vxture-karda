import type {KnowledgePackage} from "../kb/semantic/read-postgres";

export class KnowledgeWindowError extends Error {constructor(public status:number){super("knowledge_window_unavailable");}}
interface Baseline {key:string;revision:string;knowledge:KnowledgePackage}
export interface WindowRead {knowledge:KnowledgePackage;observedAt:string;action:"replace"|"unchanged"}

/** One component, one in-memory window. No persistence, polling or offline lease. */
export class KnowledgeWindowClient {
  private baseline:Baseline|null=null;
  private sequence=0;
  private controller:AbortController|null=null;
  constructor(private readonly request:typeof fetch=(...args)=>fetch(...args)){}
  clear(){this.sequence++;this.controller?.abort();this.controller=null;this.baseline=null;}
  async read(kbId:string,query:URLSearchParams):Promise<WindowRead|null>{
    const params=new URLSearchParams(query),key=JSON.stringify([kbId,params.toString()]),baseline=this.baseline?.key===key?this.baseline:null;
    const ticket=++this.sequence;this.controller?.abort();const controller=new AbortController();this.controller=controller;this.baseline=null;
    if(baseline)params.set("known_revision",baseline.revision);
    try{
      const response=await this.request(`/api/kb/${encodeURIComponent(kbId)}/knowledge-sync?${params}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
      if(ticket!==this.sequence)return null;
      if(!response.ok)throw new KnowledgeWindowError(response.status);
      const result=await response.json();
      if(ticket!==this.sequence)return null;
      if(!result||result.format!=="karda.knowledge-sync.v1"||result.reuse!=="revalidate"||
        typeof result.revision!=="string"||!/^[a-f0-9]{64}$/.test(result.revision)||typeof result.observedAt!=="string"||!Number.isFinite(Date.parse(result.observedAt)))throw new KnowledgeWindowError(503);
      let knowledge:KnowledgePackage;
      if(result.action==="unchanged"){
        if(!baseline||baseline.revision!==result.revision||result.knowledge!==null)throw new KnowledgeWindowError(503);
        knowledge=baseline.knowledge;
      }else if(result.action==="replace"){
        const v=result.knowledge;
        if(!v||v.format!=="karda.knowledge-package.v1"||!v.schema||typeof v.schema.namespace!=="string"||typeof v.schema.schemaId!=="string"||typeof v.schema.version!=="string"||
          !["nodes","edges","assertions","evidence","statements","passages","gaps"].every(k=>Array.isArray(v[k]))||v.nodes.length>500||v.edges.length>1000||
          !["complete","partial"].includes(v.sourceStatus)||typeof v.truncated!=="boolean")throw new KnowledgeWindowError(503);
        knowledge=v;
      }else throw new KnowledgeWindowError(503);
      this.baseline={key,revision:result.revision,knowledge};return {knowledge,observedAt:result.observedAt,action:result.action};
    }catch(error){
      if(ticket!==this.sequence)return null;
      this.baseline=null;throw error instanceof KnowledgeWindowError?error:new KnowledgeWindowError(503);
    }finally{if(ticket===this.sequence)this.controller=null;}
  }
}

export function initialKnowledgeEntity(value:unknown):string{
  return typeof value==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)?value:"";
}

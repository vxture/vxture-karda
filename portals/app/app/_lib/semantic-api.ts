import { ApiError } from "./api";
import type { PostgresSemanticStore,CompileTaskRow } from "../kb/semantic/store-postgres";
export type { CompileTaskRow };

export type CompileList = Awaited<ReturnType<PostgresSemanticStore["listCompiles"]>>;
export type CompileDetail = Awaited<ReturnType<PostgresSemanticStore["inspectCompile"]>>;
export type ReleasePreview = Awaited<ReturnType<PostgresSemanticStore["preview"]>>;
export type ReviewDecision = "accept" | "revise" | "reject";

export class SemanticReviewApi {
  constructor(private readonly kbId: string) {}
  private async request<T>(query: string, body?: unknown,endpoint="semantic"): Promise<T> {
    const response = await fetch(`/api/kb/${encodeURIComponent(this.kbId)}/${endpoint}${query}`, {
      cache: "no-store", credentials: "same-origin", ...(body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, result?.error);
    if (!result) throw new ApiError(503,"semantic_invalid_response");
    return result as T;
  }
  list(before?: string) { return this.request<CompileList>(before ? `?before=${encodeURIComponent(before)}` : ""); }
  tasks(query:{before?:string;state?:string;taskId?:string}={}){
    const params=new URLSearchParams(Object.entries(query).filter((e):e is [string,string]=>e[1]!==undefined)).toString();
    return this.request<{tasks:CompileTaskRow[];next?:string|null}>(params?`?${params}`:"",undefined,"compile-tasks");
  }
  createTask(taskId:string){return this.request<{taskId:string;duplicate:boolean}>("",{action:"create",taskId},"compile-tasks");}
  executeTask(taskId:string){return this.request<{claimed:boolean;runId:string|null}>("",{action:"execute",taskId},"compile-tasks");}
  resolveTask(taskId:string,resultHash:string,relationIds:string[],note:string){
    return this.request<{runId:string;duplicate:boolean}>("",{action:"resolve",taskId,resultHash,relationIds,note},"compile-tasks");
  }
  detail(runId: string) { return this.request<CompileDetail>(`?runId=${encodeURIComponent(runId)}`); }
  review(runId: string, relationId: string, expectedRevision: number, decision: ReviewDecision, note: string) {
    return this.request<{reviewId:string;revision:number}>("",{action:"review",runId,relationId,expectedRevision,decision,note});
  }
  preview(runId: string) { return this.request<ReleasePreview>("",{action:"preview",runId,eventId:crypto.randomUUID()}); }
  publish(preview: ReleasePreview) {
    // Copy only the binding, never post candidates or mutable preview summaries.
    const {runId,eventId,expectedGeneration,fingerprint}=preview;
    return this.request<{releaseId:string;generation:number;duplicate:boolean}>("",{action:"publish",runId,eventId,expectedGeneration,fingerprint});
  }
}

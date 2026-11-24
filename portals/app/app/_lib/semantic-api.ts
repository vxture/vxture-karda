import { ApiError } from "./api";
import type { PostgresSemanticStore } from "../kb/semantic/store-postgres";

export type CompileList = Awaited<ReturnType<PostgresSemanticStore["listCompiles"]>>;
export type CompileDetail = Awaited<ReturnType<PostgresSemanticStore["inspectCompile"]>>;
export type ReleasePreview = Awaited<ReturnType<PostgresSemanticStore["preview"]>>;
export type ReviewDecision = "accept" | "revise" | "reject";

export class SemanticReviewApi {
  constructor(private readonly kbId: string) {}
  private async request<T>(query: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api/kb/${encodeURIComponent(this.kbId)}/semantic${query}`, {
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

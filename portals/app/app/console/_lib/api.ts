// Console API client (track 10). Thin typed wrappers over the kb HTTP routes,
// which already enforce every authorization rule server-side (workspace scoping,
// the publish ladder, ownership). The browser only ever holds the opaque RP
// cookie, sent automatically same-origin; these helpers never see a token.
//
// Every call throws ApiError on a non-2xx so a component can branch on
// err.status (401 -> prompt sign-in) without threading a result type through the
// UI. The one place that maps a status to human wording is format.apiErrorMessage.
import type { PublishState } from "./format";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(code ?? `HTTP ${status}`);
    this.name = "ApiError";
  }
}

export interface Kb {
  id: string;
  workspaceId: string;
  ownerType: "platform" | "tenant" | "user" | "product";
  ownerSub: string | null;
  name: string;
  description: string | null;
  publishState: PublishState;
  processingTemplateId: string | null;
  governanceEnabled: boolean;
  exemptSyncedContent: boolean;
  defaultVerifier: string | null;
  defaultVerifyIntervalDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Doc {
  id: string;
  kbId: string;
  title: string;
  source: "upload" | "api" | "connector";
  contentState: string;
  verificationState: string;
  verifier: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  mime: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Mirrors AuthUser (auth/lib/claims). Name/email are intentionally NOT here -
// they are kept out of the access token, so the token-derived session only knows
// the opaque sub, the active workspace, and the scope-prefixed roles.
export interface SessionUser {
  sub: string;
  activeWorkspace?: string | null;
  activeOrg?: string | null;
  roles?: string[];
  canManage?: boolean;
  isWorkspaceOwner?: boolean;
}

async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/invalid body
  }
  if (!res.ok) {
    const code = body && typeof body === "object" ? (body as { error?: string }).error : undefined;
    throw new ApiError(res.status, code);
  }
  return body as T;
}

// --- session ------------------------------------------------------------------

export async function getSession(): Promise<{ authenticated: boolean; user?: SessionUser; reason?: string }> {
  return req("/auth/session");
}

export function loginHref(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

// --- libraries ----------------------------------------------------------------

export async function listKbs(): Promise<Kb[]> {
  const { knowledgeBases } = await req<{ knowledgeBases: Kb[] }>("/api/kb");
  return knowledgeBases;
}

export async function getKb(id: string): Promise<Kb> {
  const { knowledgeBase } = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`);
  return knowledgeBase;
}

export async function createKb(input: { name: string; description?: string }): Promise<Kb> {
  const { knowledgeBase } = await req<{ knowledgeBase: Kb }>("/api/kb", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return knowledgeBase;
}

export async function setSharing(id: string, target: PublishState): Promise<Kb> {
  const { knowledgeBase } = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  return knowledgeBase;
}

export async function setGovernance(id: string, governanceEnabled: boolean): Promise<Kb> {
  const { knowledgeBase } = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ governanceEnabled }),
  });
  return knowledgeBase;
}

// Verifier assignment (Track 12b): the default verifier (a user sub, or null to
// clear) and the re-verification interval in days (null = verify once).
export async function setVerifierConfig(
  id: string,
  cfg: { defaultVerifier: string | null; defaultVerifyIntervalDays: number | null },
): Promise<Kb> {
  const { knowledgeBase } = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return knowledgeBase;
}

// --- documents ----------------------------------------------------------------

export async function listDocuments(kbId: string): Promise<Doc[]> {
  const { documents } = await req<{ documents: Doc[] }>(`/api/kb/${kbId}/documents`);
  return documents;
}

export async function uploadDocument(kbId: string, file: File, title?: string): Promise<Doc> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const { document } = await req<{ document: Doc }>(`/api/kb/${kbId}/documents`, {
    method: "POST",
    body: form,
  });
  return document;
}

export async function deleteDocument(kbId: string, docId: string): Promise<void> {
  await req<void>(`/api/kb/${kbId}/documents/${docId}`, { method: "DELETE" });
}

export async function verifyDocument(kbId: string, docId: string): Promise<Doc> {
  const { document } = await req<{ document: Doc }>(`/api/kb/${kbId}/documents/${docId}/verify`, { method: "POST" });
  return document;
}

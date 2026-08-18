// The shared Atlas /v1 data-plane core. Atlas's consumption face (its
// authoritative 20-specs/10-http-surface.md, mirrored 2026-08-18 in the Atlas
// interface artifact) gives every /v1 error one envelope:
//
//   { code: string, message: string, retryable: boolean, retryAfterMs?: number }
//
// and requires a top-level `taskId` on every request (product_251 X-2, enforced
// since Atlas v0.15.0; karda#101). This module is the ONE place karda speaks
// that wire shape: mint the aud=atlas bearer, guard egress, POST JSON, and turn
// a non-2xx into a typed AtlasApiError the callers can branch on by `code` and
// `retryable` - never by HTTP status alone, and never by codes Atlas does not
// actually throw (karda#100: QUOTA_EXHAUSTED was promised but never thrown; the
// real code is QUOTA_EXCEEDED).
import { assertInternalTarget } from "../../lib/internal-target";
import type { AtlasTokenSource } from "../retrieval/atlas-token";

export interface AtlasContext {
  /** The platform tenant UUID (org). Atlas rejects non-UUID tenantIds (400
   *  INVALID_TENANT_ID) - this must be the platform org id, never a composite. */
  org: string;
  ws: string;
}

export interface AtlasClientCore {
  baseUrl: string;
  tokenSource: AtlasTokenSource;
  fetchImpl?: typeof fetch;
}

/**
 * A typed Atlas /v1 error. `retryable` is the machine-readable "will the same
 * request succeed later" signal (Atlas gives it on every error); `retryAfterMs`
 * accompanies RATE_LIMITED but is NOT always present (known Atlas defect
 * 2026-08-18: enrichRuntimeError drops it on some paths) - callers must null-
 * check, never assume.
 */
export class AtlasApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
    message: string,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "AtlasApiError";
  }
}

/** Parse the Atlas error envelope, tolerating a non-envelope body (a proxy 502,
 *  an HTML error page): fall back to a generic code with status-derived
 *  retryability (5xx retryable, 4xx not). */
export function toAtlasError(status: number, body: unknown): AtlasApiError {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.code === "string") {
      return new AtlasApiError(
        o.code,
        status,
        o.retryable === true,
        typeof o.message === "string" ? o.message : o.code,
        typeof o.retryAfterMs === "number" ? o.retryAfterMs : null,
      );
    }
  }
  return new AtlasApiError(
    status >= 500 ? "ATLAS_UPSTREAM_ERROR" : "ATLAS_BAD_REQUEST",
    status,
    status >= 500 || status === 429,
    `atlas endpoint returned ${status} without an error envelope`,
  );
}

/**
 * POST one Atlas /v1 request: mint (or reuse) the aud=atlas bearer for this
 * call's (org, ws), egress-guard the URL, send, and either return the parsed
 * 2xx body or throw an AtlasApiError.
 */
export async function atlasPost(
  core: AtlasClientCore,
  path: string,
  ctx: AtlasContext,
  body: Record<string, unknown>,
): Promise<unknown> {
  const token = await core.tokenSource.tokenFor({ org: ctx.org, ws: ctx.ws });
  const url = assertInternalTarget(`${core.baseUrl.replace(/\/$/, "")}${path}`);
  const fetchImpl = core.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed: unknown = await res.json().catch(() => null);
  if (!res.ok) throw toAtlasError(res.status, parsed);
  return parsed;
}

/**
 * Clamp a caller-supplied task id to Atlas's contract (any stable string,
 * <=128 chars, stored verbatim), or derive a fallback work-unit id. The same
 * agent task must send the SAME taskId across products and models - callers
 * thread one through; only a call with no task context generates one.
 */
export function taskIdOr(candidate: unknown, fallback: string): string {
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.slice(0, 128);
  }
  return fallback.slice(0, 128);
}

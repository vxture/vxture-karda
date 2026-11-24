const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
type ReviewRequest =
  | { action: "review"; runId: string; relationId: string; expectedRevision: number; decision: "accept" | "revise" | "reject"; note: string }
  | { action: "preview"; runId: string; eventId: string }
  | { action: "publish"; runId: string; eventId: string; expectedGeneration: number; fingerprint: string };

/** No identity, ontology, candidate payload or arbitrary publication command. */
export function parseReviewRequest(text: string): ReviewRequest {
  const invalid = (): never => { throw new Error("semantic_invalid_request"); };
  if (Buffer.byteLength(text) > 16384) invalid();
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return invalid(); }
  if (!body || Array.isArray(body) || typeof body !== "object") return invalid();
  const fields = body.action === "review" ? ["action","runId","relationId","expectedRevision","decision","note"]
    : body.action === "preview" ? ["action","runId","eventId"]
    : body.action === "publish" ? ["action","runId","eventId","expectedGeneration","fingerprint"] : invalid();
  if (Object.keys(body).length !== fields.length || Object.keys(body).some(k => !fields.includes(k)) ||
    typeof body.runId !== "string" || !UUID.test(body.runId)) invalid();
  const revision = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < 2147483647;
  if (body.action === "review") {
    if (typeof body.relationId !== "string" || !UUID.test(body.relationId) || !revision(body.expectedRevision) ||
      !["accept","revise","reject"].includes(body.decision as string) || typeof body.note !== "string" ||
      !body.note.trim() || [...body.note].length > 10000) invalid();
  } else {
    if (typeof body.eventId !== "string" || !UUID.test(body.eventId)) invalid();
    if (body.action === "publish" && (!revision(body.expectedGeneration) || typeof body.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.fingerprint))) invalid();
  }
  return body as ReviewRequest;
}

export function reviewOriginAllowed(request: Request, appOrigin: string): boolean {
  return Boolean(appOrigin) && request.headers.get("origin") === appOrigin && request.headers.get("sec-fetch-site") !== "cross-site";
}

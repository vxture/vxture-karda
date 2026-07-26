import { NextResponse } from "next/server";
import { parseEnvelope } from "../../../kb/connectors/envelope";
import { ingestEnvelope } from "../../../kb/connectors/ingest";
import { ContentService } from "../../../kb/lib/content-service";
import { getContentStore } from "../../../kb/lib/content-store";
import { getBindingStore } from "../../../kb/connectors/binding-store";
import { getKbStore } from "../../../kb/lib/store";
import { getObjectStore } from "../../../kb/storage/objectstore";
import { getProcessingRuntime } from "../../../kb/processing/runtime";

// POST /api/connectors/ingest   apply one connector ingest envelope (Track 11b)
//
// The delivery-agnostic entry point: a poll driver or a notify handler hands the
// same envelope here (220-connector-framework section 6). Gated by
// INTERNAL_JOB_TOKEN - the connector runtime is a service/background caller, never
// a user session - and fail-closed, like the usage flush and the governance sweep.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) return new NextResponse("forbidden", { status: 403 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // invalid/empty JSON -> parse rejects below
  }
  const parsed = parseEnvelope(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid_envelope", detail: parsed.error }, { status: 400 });

  const runtime = getProcessingRuntime();
  const result = await ingestEnvelope(parsed.value, {
    content: new ContentService(getContentStore()),
    bindings: getBindingStore(),
    kbs: getKbStore(),
    objects: getObjectStore(),
    queue: runtime.queue,
  });
  if (!result.ok) {
    const status =
      result.error.code === "binding_not_found" || result.error.code === "kb_not_found"
        ? 404
        : result.error.code === "binding_inactive"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }
  return NextResponse.json(result.value);
}

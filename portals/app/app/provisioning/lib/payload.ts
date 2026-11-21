import type { ProvisioningEvent } from "./handler";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseProvisioningPayload(value: unknown, headers: Headers): ProvisioningEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(body.id)
    || typeof body.type !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(body.type)
    || body.application !== "karda"
    || typeof body.workspace_id !== "string" || !uuid.test(body.workspace_id)
    || typeof body.tenant_id !== "string" || !uuid.test(body.tenant_id)
    || !Number.isSafeInteger(body.occurred_at) || (body.occurred_at as number) < 0
    || (body.plan != null && (typeof body.plan !== "string" || body.plan.length > 200))
    || (body.data != null && (typeof body.data !== "object" || Array.isArray(body.data)))) throw new Error("invalid_payload");
  const lifecycle = body.type === "tenant.provisioned" || body.type === "tenant.deprovisioned";
  if (lifecycle ? !Number.isSafeInteger(body.seq) || (body.seq as number) < 1 : body.seq !== undefined) {
    throw new Error("invalid_payload_version");
  }
  for (const [key, expected] of [["x-vxture-delivery", body.id], ["x-vxture-event", body.type]]) {
    const header = headers.get(key);
    if (header !== null && header !== expected) throw new Error("webhook_header_mismatch");
  }
  // Retain additive signed fields in the receipt fingerprint.
  return body as unknown as ProvisioningEvent;
}
export async function readWebhookBody(req: Request): Promise<string> {
  if (Number(req.headers.get("content-length")) > 1048576) throw new Error("body_budget");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1048576) throw new Error("body_budget");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { await reader.cancel(); reader.releaseLock(); }
}

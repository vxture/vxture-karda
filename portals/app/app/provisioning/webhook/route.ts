import { publishWorkspaceRevision } from "../../events/outbox";
import { acknowledgeProvisioning } from "../lib/ack";
import { verifySignature, webhookSecrets } from "../lib/verify";
import { handleProvisioning } from "../lib/handler";
import { getProvisioningStore } from "../lib/store";
import { parseProvisioningPayload, readWebhookBody } from "../lib/payload";
import { getEntitlementResolver } from "../../entitlement/resolver";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request): Promise<Response> {
  if (!webhookSecrets().length) return new Response("webhook unavailable", { status: 503 });
  let raw: string;
  try { raw = await readWebhookBody(req); }
  catch { return new Response("invalid body", { status: 400 }); }
  if (!verifySignature(raw, req.headers.get("x-vxture-signature"), webhookSecrets())) {
    return new Response("invalid signature", { status: 401 });
  }
  let event;
  try { event = parseProvisioningPayload(JSON.parse(raw), req.headers); }
  catch { return new Response("invalid payload or headers", { status: 400 }); }
  // The upstream read/webhook contract has no environment scope. Beta must not
  // apply or acknowledge product-wide production lifecycle state.
  if (process.env.DEPLOY_STAGE === "beta" && event.type.startsWith("tenant.")) {
    return new Response("unscoped lifecycle unavailable on beta", { status: 503 });
  }
  try {
    const result = await handleProvisioning(event, { store: getProvisioningStore(), product: "karda",
      onSubscriptionChanged: async ws => {
        getEntitlementResolver().invalidate(ws);
        await publishWorkspaceRevision(ws);
      } });
    if (event.type === "tenant.provisioned") await acknowledgeProvisioning(event.workspace_id, event.seq!, event.id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("processing unavailable", { status: 503 });
  }
}

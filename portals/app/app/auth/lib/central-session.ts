import type { OidcConfig } from "./config";

export type CentralStatus = { valid: false } | { valid: true; next_check_at: number };

/** Read only: checking a tab/session is not proof of user activity. */
export async function checkCentralSession(cfg: OidcConfig, sid: string,
  fetcher: typeof fetch = fetch, now = Math.floor(Date.now() / 1000)): Promise<CentralStatus> {
  if (!sid) throw new Error("central_sid_required");
  const credentials = `${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`;
  const response = await fetcher(cfg.tokenUrl.replace(/\/token$/, "/session/status"), {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
      "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sid, active: false }), cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status !== 200) throw new Error("central_session_unavailable");
  const body = await response.json() as Record<string, unknown> | null;
  if (body?.valid === false) return { valid: false };
  if (body?.valid !== true || !Number.isSafeInteger(body.next_check_at)
    || (body.next_check_at as number) <= now) throw new Error("central_session_invalid_response");
  return { valid: true, next_check_at: body.next_check_at as number };
}

// Runos-channel authentication (230-runos-channel section 4). The gateway
// injects one account-scoped bearer credential per its contract-declared
// injection ({carrier: header, name: Authorization, scheme: Bearer} - the
// standard shape Runos verified against real third-party endpoints); karda
// verifies it against RUNOS_CHANNEL_TOKEN with a constant-time comparison.
//
// Postures copied deliberately from the platform's own discipline:
// - unset secret = 503 fail-closed and LOUD (a 401 would read as "the gateway's
//   credential is wrong" and send the operator to the wrong console);
// - x-vxture-internal-auth is refused as a category error (same as the S2S
//   gateway: the platform shared secret is never a product-to-product
//   credential);
// - compare via sha256 digests + timingSafeEqual (length-safe: the digests are
//   always 32 bytes, so a length mismatch cannot leak timing either).
import { createHash, timingSafeEqual } from "node:crypto";
import { rejectsInternalAuthHeader } from "../tools/s2s";

export type ChannelAuthResult = { ok: true } | { ok: false; status: 401 | 403 | 503; error: string };

export function authenticateChannel(headers: { get(name: string): string | null }): ChannelAuthResult {
  if (rejectsInternalAuthHeader(headers)) {
    return { ok: false, status: 403, error: "invalid_auth: x-vxture-internal-auth is not a channel credential" };
  }

  const expected = process.env.RUNOS_CHANNEL_TOKEN;
  if (!expected) {
    return { ok: false, status: 503, error: "channel_not_configured: RUNOS_CHANNEL_TOKEN is unset" };
  }

  const header = headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "missing_token: expected a Bearer credential" };
  }
  const presented = header.slice(7).trim();

  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "invalid_token" };
  }
  return { ok: true };
}

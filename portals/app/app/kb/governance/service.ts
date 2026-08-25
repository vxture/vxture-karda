// Governance runtime (Track 12): the enterprise-trust layer that drives the
// verification state machine the asset + retrieval layers already leave seams for.
// Three operations:
//   - verify: a verifier marks a document/entry verified, which stamps the clock
//     (verifier + verifiedAt + expiresAt from the library interval).
//   - sweep: an interval-expiry pass that moves lapsed `verified` items to
//     `stale` (evaluateExpiry), so the default quality tier stops recalling them.
// The pure decisions (governanceApplies / evaluateExpiry / the transition table)
// live in ../lib/state; this binds them to the stores and resolves the per-library
// policy. Nothing here decides retrieval - `stale` is a read-time filter, not a
// content-state change (state.ts note on orthogonality).
import type { ContentStore, DocumentRow, EntryRow, VerificationPatch } from "../lib/content-store";
import type { KbStore } from "../lib/store";
import { governanceApplies, evaluateExpiry, type GovernancePolicy } from "../lib/state";
import { policyForKb } from "./policy";

export type GovernanceError =
  | { code: "not_found" }
  | { code: "governance_off" }
  | { code: "governance_exempt" };

export type Result<T> = { ok: true; value: T } | { ok: false; error: GovernanceError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: GovernanceError): Result<never> => ({ ok: false, error });

export interface SweepSummary {
  scanned: number;
  staled: number;
}

const DAY_MS = 86_400_000;

/** The columns a fresh verification writes: verified now, clock set per interval. */
function verifiedPatch(verifierSub: string, now: Date, policy: GovernancePolicy): VerificationPatch {
  return {
    verificationState: "verified",
    verifier: verifierSub,
    verifiedAt: now,
    expiresAt: policy.intervalDays ? new Date(now.getTime() + policy.intervalDays * DAY_MS) : null,
  };
}

export class GovernanceService {
  constructor(
    private content: ContentStore,
    private kbs: KbStore,
  ) {}

  /**
   * Verify a document. Refused when the library has governance off, or when the
   * document is connector-synced and the library exempts synced content - in both
   * cases there is nothing to verify, and saying so beats silently succeeding.
   */
  async verifyDocument(docId: string, verifierSub: string, now: Date): Promise<Result<DocumentRow>> {
    const doc = await this.content.getDocument(docId);
    if (!doc) return err({ code: "not_found" });
    const gate = await this.gate(doc.kbId, doc.source === "connector");
    if (!gate.ok) return gate;
    const updated = await this.content.setDocumentVerification(docId, verifiedPatch(verifierSub, now, gate.value));
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  /** Verify an entry. Entries are authored, never connector-synced, so only the
   *  governance-off gate applies. */
  async verifyEntry(entryId: string, verifierSub: string, now: Date): Promise<Result<EntryRow>> {
    const entry = await this.content.getEntry(entryId);
    if (!entry) return err({ code: "not_found" });
    const gate = await this.gate(entry.kbId, false);
    if (!gate.ok) return gate;
    const updated = await this.content.setEntryVerification(entryId, verifiedPatch(verifierSub, now, gate.value));
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  /**
   * Interval-expiry sweep: move `verified` items whose clock has run out to
   * `stale`. evaluateExpiry is the authority (it re-checks governanceApplies and
   * the current interval), so an item in a library that has since turned
   * governance off is left alone - the sweep never fabricates a stale.
   *
   * `kbIds` narrows the scan. The cron caller omits it and sweeps globally,
   * which is correct for a job running as the system. Anything a USER can
   * trigger must pass it: unscoped, one tenant pressing a button would scan and
   * re-state every other tenant's corpus.
   */
  async sweep(now: Date, limit = 200, kbIds?: string[]): Promise<SweepSummary> {
    const due = await this.content.dueForStale(now, limit, kbIds);
    const policyCache = new Map<string, GovernancePolicy | null>();
    let staled = 0;

    for (const item of due) {
      let policy = policyCache.get(item.kbId);
      if (policy === undefined) {
        const kb = await this.kbs.getKb(item.kbId);
        policy = kb ? policyForKb(kb) : null;
        policyCache.set(item.kbId, policy);
      }
      if (!policy) continue;

      const row = item.kind === "document" ? await this.content.getDocument(item.id) : await this.content.getEntry(item.id);
      if (!row) continue;
      const synced = item.kind === "document" && (row as DocumentRow).source === "connector";
      const next = evaluateExpiry(policy, {
        synced,
        verificationState: row.verificationState,
        verifiedAt: row.verifiedAt ?? undefined,
      }, now);
      if (next !== "stale" || row.verificationState === "stale") continue;

      // Keep verifier/verifiedAt/expiresAt as the lapse record; only the state moves.
      const patch: VerificationPatch = {
        verificationState: "stale",
        verifier: row.verifier,
        verifiedAt: row.verifiedAt,
        expiresAt: row.expiresAt,
      };
      if (item.kind === "document") await this.content.setDocumentVerification(item.id, patch);
      else await this.content.setEntryVerification(item.id, patch);
      staled += 1;
    }
    return { scanned: due.length, staled };
  }

  /** Resolve the library policy and enforce the two "nothing to verify" refusals. */
  private async gate(kbId: string, synced: boolean): Promise<Result<GovernancePolicy>> {
    const kb = await this.kbs.getKb(kbId);
    if (!kb) return err({ code: "not_found" });
    const policy = policyForKb(kb);
    if (!policy.enabled) return err({ code: "governance_off" });
    if (!governanceApplies(policy, { synced })) return err({ code: "governance_exempt" });
    return ok(policy);
  }
}

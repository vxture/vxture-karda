// Resolve a library's governance policy from its row. The KB row carries the
// three knobs (100-kb-model 5.2): whether governance is on at all, whether
// connector-synced content is exempt, and the re-verification interval. The pure
// state machine in ../lib/state consumes this shape - keeping the mapping here
// means the runtime never reaches into raw columns to decide governance.
import type { KnowledgeBaseRow } from "../lib/store";
import type { GovernancePolicy } from "../lib/state";

export function policyForKb(kb: KnowledgeBaseRow): GovernancePolicy {
  return {
    enabled: kb.governanceEnabled,
    exemptSyncedContent: kb.exemptSyncedContent,
    // null interval = verify once, never expires; undefined is the state machine's
    // "no interval" sentinel, so normalise null -> undefined.
    intervalDays: kb.defaultVerifyIntervalDays ?? undefined,
  };
}

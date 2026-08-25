import type { ContentStore, DocumentRow } from "../lib/content-store";
import type { BindingRow } from "./binding-store";

// What revoking a binding will COST, computed before it happens.
//
// `revokeCascade` already tells you what it did. Batch 12's item is the other
// half: telling the owner beforehand. A confirmation that says "are you sure?"
// asks a question the person cannot answer - they do not know what is behind the
// button. This computes the answer.
//
// THE SECOND CONSEQUENCE IS THE SEVERE ONE, and it is not obvious from the API.
// `uidx_binding_kb_connector_source` is UNIQUE over (kb_id, connector_code,
// external_source_id) with NO state predicate, and `findBySource` matches
// revoked rows - so once a source is revoked from a library it can NEVER be
// bound to that library again. Revoke is not "unsubscribe, resubscribe later";
// it is permanent for that pair. An owner who learns this after clicking has
// learned it too late, so the preview states it as plainly as the document
// count.

export interface RevokeImpact {
  /** Live documents that would leave recall - tombstoned by the cascade. */
  documents: number;
  /** How many of those were VERIFIED. This is the part that actually hurts:
   *  content someone reviewed and vouched for, dropping out of the trusted
   *  tier. A raw total hides it inside the backlog. */
  verified: number;
  /** Documents already stale/unverified - they leave too, but nothing trusted
   *  is lost with them. */
  unverified: number;
  /** Always false today, and the field exists to say so out loud rather than
   *  leave the caller to assume the friendlier answer. */
  rebindable: false;
  /** The binding's own identity, so a confirmation can name what it is about to
   *  destroy rather than say "this binding". */
  connectorCode: string;
  externalSourceId: string;
}

/** Pure: the impact of revoking, given the live documents behind the binding. */
export function revokeImpact(binding: Pick<BindingRow, "connectorCode" | "externalSourceId">, docs: DocumentRow[]): RevokeImpact {
  const verified = docs.filter((d) => d.verificationState === "verified").length;
  return {
    documents: docs.length,
    verified,
    unverified: docs.length - verified,
    rebindable: false,
    connectorCode: binding.connectorCode,
    externalSourceId: binding.externalSourceId,
  };
}

/** Read the impact for a binding. Counts only LIVE documents - the same set the
 *  cascade will act on, so the preview and the outcome cannot disagree. */
export async function readRevokeImpact(binding: BindingRow, content: ContentStore): Promise<RevokeImpact> {
  const docs = await content.listLiveConnectorDocsByBinding(binding.kbId, binding.id);
  return revokeImpact(binding, docs);
}

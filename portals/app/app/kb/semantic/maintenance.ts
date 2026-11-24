import type { PublishedRelationInput } from "./read-postgres";
import { matchesSourceSpan } from "./source-text";

export type MaintenanceIssue = "source_missing" | "source_changed" | "source_inactive" | "source_unavailable"
  | "assertion_inactive" | "evidence_missing" | "review_changed" | "entity_missing";
export interface MaintenanceDocument {
  id: string; title: string; content_state: string; content_hash: string | null; active_chunk_version: number | null;
}
export interface MaintenanceAssertion {
  id: string; content_state: string; verification_state: string; expires_at: Date | null;
  valid_until: Date | null; superseded_by: string | null;
}
export interface MaintenanceGround {
  assertion_id: string; document_id: string; document_version: number; start_offset: number; end_offset: number; excerpt: string;
}
export interface MaintenanceReport {
  generation: number; releaseId: string | null; checkedAt: string;
  sources: { id: string; title: string; publishedVersion: number; currentVersion: number | null;
    issues: MaintenanceIssue[]; relationIds: string[] }[];
  relations: { id: string; type: string; sourceId: string; targetId: string; issues: MaintenanceIssue[]; documentIds: string[] }[];
}

/** A diagnostic of a frozen publication against one current authority snapshot.
 * Never used as a read grant, review decision or automatic publication input. */
export function maintenanceReport(input: PublishedRelationInput, current: {
  generation: number; releaseId: string; now: Date; documents: MaintenanceDocument[];
  texts: ReadonlyMap<string, string | null>; assertions: MaintenanceAssertion[];
  grounds: MaintenanceGround[]; entityTypes: ReadonlyMap<string, string>; reviewedIds: ReadonlySet<string>;
}): MaintenanceReport {
  const documents = new Map(current.documents.map(row => [row.id, row]));
  const assertions = new Map(current.assertions.map(row => [row.id, row]));
  const sources = input.sources.map(source => {
    const doc = documents.get(source.documentId), issues: MaintenanceIssue[] = [];
    if (!doc) issues.push("source_missing");
    else {
      if (doc.content_state !== "indexed") issues.push("source_inactive");
      if (doc.content_hash !== source.contentHash || doc.active_chunk_version !== source.version) issues.push("source_changed");
      if (!issues.length && current.texts.get(doc.id) == null) issues.push("source_unavailable");
    }
    return { id: source.documentId, title: doc?.title ?? source.documentId, publishedVersion: source.version,
      currentVersion: doc?.active_chunk_version ?? null, issues, relationIds: [] as string[] };
  });
  const bySource = new Map(sources.map(row => [row.id, row]));
  const relations = input.relations.map(relation => {
    const issues = new Set<MaintenanceIssue>(), documentIds = new Set<string>();
    if (!current.reviewedIds.has(relation.id)) issues.add("review_changed");
    const definition=input.schema.relationTypes.find(row=>row.id===relation.type);
    if (!definition || !definition.sourceTypes.includes(current.entityTypes.get(relation.sourceId)??"") ||
        !definition.targetTypes.includes(current.entityTypes.get(relation.targetId)??"")) issues.add("entity_missing");
    for (const id of relation.assertionIds) {
      const assertion = assertions.get(id);
      if (!assertion || assertion.content_state !== "indexed" || assertion.verification_state !== "verified" || assertion.superseded_by ||
          (assertion.expires_at && assertion.expires_at <= current.now) || (assertion.valid_until && assertion.valid_until <= current.now))
        issues.add("assertion_inactive");
      let supported = false;
      for (const ground of current.grounds.filter(row => row.assertion_id === id)) {
        documentIds.add(ground.document_id);
        const source = bySource.get(ground.document_id), text = current.texts.get(ground.document_id);
        if (source) for (const issue of source.issues) issues.add(issue);
        if (source && !source.issues.length && source.publishedVersion === ground.document_version && text != null &&
            matchesSourceSpan(text, ground.start_offset, ground.end_offset, ground.excerpt)) supported = true;
      }
      if (!supported) issues.add("evidence_missing");
    }
    for (const id of documentIds) bySource.get(id)?.relationIds.push(relation.id);
    return { id: relation.id, type: relation.type, sourceId: relation.sourceId, targetId: relation.targetId,
      issues: [...issues].sort(), documentIds: [...documentIds].sort() };
  }).sort((a,b) => a.id.localeCompare(b.id));
  return { generation: current.generation, releaseId: current.releaseId, checkedAt: current.now.toISOString(),
    sources: sources.sort((a,b) => a.id.localeCompare(b.id)).map(row => ({...row, relationIds: [...new Set(row.relationIds)].sort()})), relations };
}

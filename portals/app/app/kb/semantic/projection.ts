import { isRecallable } from "../assertions/kinds";
import type {
  AuthorizedReadScope, GraphAssertion, GraphEvidence, GraphProjection,
  KnowledgeSnapshot, NeighborhoodQuery, OntologySchema, SchemaRef, SemanticRelation,
} from "./contracts";

const nonempty = (value: string): boolean => typeof value === "string" && value.trim().length > 0;
const distinct = (items: string[]): boolean => new Set(items).size === items.length;
const sameSchema = (a: SchemaRef, b: SchemaRef): boolean =>
  a.namespace === b.namespace && a.schemaId === b.schemaId && a.version === b.version;

/** Fail closed on an ambiguous or incomplete internal schema. */
export function validateOntology(schema: OntologySchema): void {
  if (![schema.namespace, schema.schemaId, schema.version].every(nonempty) ||
      schema.entityTypes.length === 0 || !schema.entityTypes.every(nonempty) ||
      !distinct(schema.entityTypes) || !distinct(schema.relationTypes.map(r => r.id))) {
    throw new Error("invalid_ontology");
  }
  const types = new Set(schema.entityTypes);
  for (const relation of schema.relationTypes) {
    if (!nonempty(relation.id) || relation.sourceTypes.length === 0 || relation.targetTypes.length === 0 ||
        !distinct(relation.sourceTypes) || !distinct(relation.targetTypes) ||
        ![...relation.sourceTypes, ...relation.targetTypes].every(t => types.has(t))) {
      throw new Error("invalid_ontology");
    }
  }
}

function indexUnique<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (index.has(id)) throw new Error("ambiguous_snapshot");
    index.set(id, item);
  }
  return index;
}
const sourceKey = (kbId: string, documentId: string, version: number): string =>
  JSON.stringify([kbId, documentId, version]);

function activeAt(a: GraphAssertion, now: number): boolean {
  const from = a.validFrom === null ? -Infinity : Date.parse(a.validFrom);
  const until = a.validUntil === null ? Infinity : Date.parse(a.validUntil);
  const verificationExpiry = a.verificationExpiresAt === null ? Infinity : Date.parse(a.verificationExpiresAt);
  return !Number.isNaN(from) && !Number.isNaN(until) && !Number.isNaN(verificationExpiry) &&
    from < until && from <= now && now < until && now < verificationExpiry;
}

export function validateNeighborhoodQuery(query: NeighborhoodQuery): void {
  const bounded = (n: number, min: number, max: number): boolean =>
    Number.isInteger(n) && n >= min && n <= max;
  if (!bounded(query.maxHops, 0, 4) || !bounded(query.maxNodes, 1, 500) ||
      !bounded(query.maxEdges, 1, 1000) || !bounded(query.seedIds.length, 1, 50) ||
      !query.seedIds.every(nonempty) || (query.relationTypes &&
      (query.relationTypes.length > 50 || !query.relationTypes.every(nonempty)))) {
    throw new Error("invalid_graph_query");
  }
}

/**
 * Pure authorized current-knowledge projection. No IO, side effects or HTTP.
 * Evidence eligibility and permissions are computed BEFORE graph traversal.
 * A suggestion, hidden edge, stale source or expired premise cannot bridge seeds.
 * Inferred edges are deliberately excluded until a deterministic proof adapter exists.
 */
export function projectNeighborhood(
  snapshot: KnowledgeSnapshot,
  schema: OntologySchema,
  scope: AuthorizedReadScope,
  query: NeighborhoodQuery,
): GraphProjection {
  validateOntology(schema);
  validateNeighborhoodQuery(query);
  const now = Date.parse(scope.now);
  if (!Number.isFinite(now)) throw new Error("invalid_read_clock");
  // Internal IDs are global stable IDs. Duplicate IDs are corrupt input, not a merge.
  const entities = indexUnique(snapshot.entities, n => n.id);
  const assertions = indexUnique(snapshot.assertions, a => a.id);
  const evidence = indexUnique(snapshot.evidence, e => e.id);
  indexUnique(snapshot.relations, e => e.id);
  const sources = indexUnique(snapshot.sources, s => sourceKey(s.kbId, s.documentId, s.version));
  const currentVersions = new Map<string, number>();
  for (const source of snapshot.sources) {
    if (!Number.isInteger(source.version) || source.version < 1 ||
        !Number.isInteger(source.textLength) || source.textLength < 0) throw new Error("invalid_source_state");
    if (source.current) {
      const key = JSON.stringify([source.kbId, source.documentId]);
      if (currentVersions.has(key)) throw new Error("ambiguous_source_version");
      currentVersions.set(key, source.version);
    }
  }
  const supported = new Map<string, GraphEvidence[]>();
  for (const assertion of assertions.values()) {
    if (!scope.visibleKbIds.has(assertion.kbId) || assertion.verificationState !== "verified" ||
        !activeAt(assertion, now)) continue;
    const grounds = [...new Set(assertion.evidenceIds)].flatMap(id => {
      const item = evidence.get(id);
      if (!item || item.kbId !== assertion.kbId || item.stance !== "supports") return [];
      const source = sources.get(sourceKey(item.kbId, item.documentId, item.documentVersion));
      if (!source || !source.current || source.withdrawn ||
          !Number.isInteger(item.start) || !Number.isInteger(item.end) ||
          item.start < 0 || item.start >= item.end || item.end > source.textLength) return [];
      return [item];
    });
    if (isRecallable({
      contentState: assertion.contentState, supportingEvidenceCount: grounds.length,
      supersededById: assertion.supersededById,
    })) supported.set(assertion.id, grounds);
  }

  const relationTypes = new Map(schema.relationTypes.map(r => [r.id, r]));
  const allowedTypes = query.relationTypes ? new Set(query.relationTypes) : null;
  const eligible = snapshot.relations.filter(edge => {
    if (edge.origin !== "asserted" || !scope.visibleKbIds.has(edge.kbId) ||
        !sameSchema(edge.schema, schema) || (allowedTypes && !allowedTypes.has(edge.type))) return false;
    const definition = relationTypes.get(edge.type);
    const source = entities.get(edge.sourceId);
    const target = entities.get(edge.targetId);
    return !!definition && !!source && !!target && source.kbId === edge.kbId &&
      target.kbId === edge.kbId && definition.sourceTypes.includes(source.type) &&
      definition.targetTypes.includes(target.type) && edge.assertionIds.length > 0 &&
      edge.assertionIds.every(id => assertions.get(id)?.kbId === edge.kbId && supported.has(id));
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // Build adjacency solely from eligible edges: hidden structure cannot affect results.
  const neighbors = new Map<string, SemanticRelation[]>();
  for (const edge of eligible) {
    for (const id of new Set([edge.sourceId, edge.targetId])) {
      const bucket = neighbors.get(id) ?? [];
      bucket.push(edge);
      neighbors.set(id, bucket);
    }
  }
  const reached = new Set<string>();
  const queue: { id: string; depth: number }[] = [];
  let truncated = false;
  for (const id of [...new Set(query.seedIds)].sort()) {
    if (!neighbors.has(id)) continue;
    if (reached.size >= query.maxNodes) { truncated = true; continue; }
    reached.add(id);
    queue.push({ id, depth: 0 });
  }
  const chosen = new Map<string, SemanticRelation>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.depth >= query.maxHops) continue;
    for (const edge of neighbors.get(current.id) ?? []) {
      if (chosen.has(edge.id)) continue;
      const other = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
      if (chosen.size >= query.maxEdges || (!reached.has(other) && reached.size >= query.maxNodes)) {
        truncated = true;
        continue;
      }
      if (!reached.has(other)) {
        reached.add(other);
        queue.push({ id: other, depth: current.depth + 1 });
      }
      chosen.set(edge.id, edge);
    }
  }
  const assertionIds = [...new Set([...chosen.values()].flatMap(e => e.assertionIds))].sort();
  const chosenEvidence = new Map<string, GraphEvidence>();
  for (const id of assertionIds) for (const ground of supported.get(id) ?? []) chosenEvidence.set(ground.id, ground);
  const compareIds = <T extends {id: string}>(a: T, b: T): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    schema: { namespace: schema.namespace, schemaId: schema.schemaId, version: schema.version },
    nodes: [...reached].map(id => {
      const node = entities.get(id)!;
      return { id: node.id, kbId: node.kbId, type: node.type, label: node.label };
    }).sort(compareIds),
    edges: [...chosen.values()].map(edge => ({
      id: edge.id, kbId: edge.kbId, type: edge.type, origin: edge.origin,
      sourceId: edge.sourceId, targetId: edge.targetId,
      schema: { namespace: edge.schema.namespace, schemaId: edge.schema.schemaId, version: edge.schema.version },
      assertionIds: [...edge.assertionIds],
    })).sort(compareIds),
    assertions: assertionIds.map(id => {
      const assertion = assertions.get(id)!;
      // Never expose dangling, hidden, stale or contradictory evidence IDs.
      return {
        id: assertion.id, kbId: assertion.kbId, contentState: assertion.contentState,
        verificationState: assertion.verificationState, verificationExpiresAt: assertion.verificationExpiresAt,
        supersededById: assertion.supersededById,
        validFrom: assertion.validFrom, validUntil: assertion.validUntil,
        evidenceIds: (supported.get(id) ?? []).map(e => e.id).sort(),
      };
    }),
    evidence: [...chosenEvidence.values()].map(e => ({
      id: e.id, kbId: e.kbId, documentId: e.documentId, documentVersion: e.documentVersion,
      stance: e.stance, start: e.start, end: e.end,
      ...(e.pages?{pages:[...e.pages]}:{}),
    })).sort(compareIds),
    truncated,
  };
}

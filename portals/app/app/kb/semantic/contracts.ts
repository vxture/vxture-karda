// Internal reconstruction contracts (160 §2–4). Not a public tool schema.
// Scope and source state must be loaded by a trusted server adapter per request.
export interface SchemaRef {
  namespace: string;
  schemaId: string;
  version: string;
}
export interface OntologySchema extends SchemaRef {
  entityTypes: string[];
  relationTypes: { id: string; sourceTypes: string[]; targetTypes: string[] }[];
}
export interface SourceVersion {
  kbId: string;
  documentId: string;
  version: number;
  current: boolean;
  withdrawn: boolean;
  textLength: number;
}
export interface GraphEvidence {
  id: string;
  kbId: string;
  documentId: string;
  documentVersion: number;
  stance: "supports" | "contradicts";
  start: number;
  end: number;
}
export interface GraphAssertion {
  id: string;
  kbId: string;
  contentState: string;
  verificationState: string;
  supersededById: string | null;
  validFrom: string | null;
  validUntil: string | null;
  evidenceIds: string[];
}
export interface GraphEntity {
  id: string;
  kbId: string;
  type: string;
  label: string;
}
export interface SemanticRelation {
  id: string;
  kbId: string;
  schema: SchemaRef;
  type: string;
  sourceId: string;
  targetId: string;
  assertionIds: string[];
  origin: "asserted" | "inferred" | "suggested";
}
export interface KnowledgeSnapshot {
  entities: GraphEntity[];
  relations: SemanticRelation[];
  assertions: GraphAssertion[];
  evidence: GraphEvidence[];
  sources: SourceVersion[];
}
export interface AuthorizedReadScope {
  /** Server-computed visibility AND attachment intersection, never caller input. */
  visibleKbIds: ReadonlySet<string>;
  /** Server clock. Historical access needs a separate contract. */
  now: string;
}
export interface NeighborhoodQuery {
  seedIds: string[];
  relationTypes?: string[];
  maxHops: number;
  maxNodes: number;
  maxEdges: number;
}
export interface GraphProjection {
  schema: SchemaRef;
  nodes: GraphEntity[];
  edges: SemanticRelation[];
  assertions: GraphAssertion[];
  evidence: GraphEvidence[];
  /** Only indicates truncation of the authorized eligible neighborhood. */
  truncated: boolean;
}

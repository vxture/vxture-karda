import type { OntologySchema, SemanticRelation } from "./contracts";
import type { PublishedRelationInput } from "./read-postgres";
import { preparePublication, type PublicationCommand } from "./publication";
import { validateOntology } from "./projection";

export const SEMANTIC_RELEASE_FORMAT = "karda.semantic.release.v1";
export interface SemanticReleasePayload {
  format: typeof SEMANTIC_RELEASE_FORMAT;
  schema: OntologySchema;
  entityTypes: { kind: string; type: string }[];
  relations: SemanticRelation[];
  sources: PublishedRelationInput["sources"];
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function invalid(): never { throw new Error("semantic_invalid_release"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid();
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!UUID.test(result)) return invalid();
  return result;
}
function array(value: unknown, max = 5000): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value;
}
function unique(values: string[]): void {
  if (new Set(values).size !== values.length) invalid();
}

/** Decode a bounded immutable command into the precise read-side input. */
export function decodeSemanticRelease(input: PublicationCommand): PublishedRelationInput {
  const { command } = preparePublication(input);
  const payload = object(command.payload);
  if (payload.format !== SEMANTIC_RELEASE_FORMAT) invalid();
  const definition = object(payload.schema);
  const schema: OntologySchema = {
    namespace: text(definition.namespace), schemaId: text(definition.schemaId), version: text(definition.version),
    entityTypes: array(definition.entityTypes, 256).map(value => text(value)),
    relationTypes: array(definition.relationTypes, 256).map(value => {
      const row = object(value);
      return { id: text(row.id), sourceTypes: array(row.sourceTypes, 256).map(value => text(value)),
        targetTypes: array(row.targetTypes, 256).map(value => text(value)) };
    }),
  };
  validateOntology(schema);
  const entityTypes = new Map<string, string>();
  for (const entry of array(payload.entityTypes, 256)) {
    const row = object(entry), kind = text(row.kind), type = text(row.type);
    if (entityTypes.has(kind) || !schema.entityTypes.includes(type)) invalid();
    entityTypes.set(kind, type);
  }
  const sources = array(payload.sources).map(entry => {
    const row = object(entry), kbId = id(row.kbId), documentId = id(row.documentId);
    if (kbId !== command.kbId || !Number.isSafeInteger(row.version) || (row.version as number) < 1 ||
        typeof row.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(row.contentHash)) invalid();
    return { kbId, documentId, version: row.version as number, contentHash: row.contentHash as string };
  });
  unique(sources.map(row => row.documentId));
  const relations = array(payload.relations).map(entry => {
    const row = object(entry), ref = object(row.schema);
    const kbId = id(row.kbId), type = text(row.type);
    if (kbId !== command.kbId || row.origin !== "asserted" ||
        ref.namespace !== schema.namespace || ref.schemaId !== schema.schemaId || ref.version !== schema.version ||
        !schema.relationTypes.some(definition => definition.id === type)) invalid();
    const assertionIds = array(row.assertionIds, 256).map(id);
    if (!assertionIds.length) invalid();
    unique(assertionIds);
    return { id: id(row.id), kbId, schema: { namespace: schema.namespace, schemaId: schema.schemaId, version: schema.version },
      type, sourceId: id(row.sourceId), targetId: id(row.targetId), assertionIds, origin: "asserted" as const };
  });
  unique(relations.map(row => row.id));
  if (relations.length && (!sources.length || !entityTypes.size)) invalid();
  return { schema, entityTypes, relations, sources };
}

/** Schema/mapping must be identical across libraries in a single projection. */
export function semanticDefinitionKey(input: PublishedRelationInput): string {
  const schema = input.schema;
  return JSON.stringify({ namespace: schema.namespace, schemaId: schema.schemaId, version: schema.version,
    entityTypes: [...schema.entityTypes].sort(),
    relationTypes: schema.relationTypes.map(row => ({ id: row.id,
      sourceTypes: [...row.sourceTypes].sort(), targetTypes: [...row.targetTypes].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
    mappings: [...input.entityTypes].sort(([a], [b]) => a.localeCompare(b)),
  });
}

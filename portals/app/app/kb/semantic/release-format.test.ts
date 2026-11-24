import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { decodeSemanticRelease, SEMANTIC_RELEASE_FORMAT, semanticDefinitionKey, type SemanticReleasePayload } from "./release-format";
import type { PublicationCommand } from "./publication";

function fixture(): PublicationCommand & { payload: SemanticReleasePayload } {
  const kbId = randomUUID();
  const schema = { namespace: "test", schemaId: "objects", version: "1", entityTypes: ["object"],
    relationTypes: [{ id: "requires", sourceTypes: ["object"], targetTypes: ["object"] }] };
  return { kbId, eventId: randomUUID(), expectedGeneration: 0, sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1",
    payload: { format: SEMANTIC_RELEASE_FORMAT, schema, entityTypes: [{ kind: "legacy", type: "object" }],
      sources: [{ kbId, documentId: randomUUID(), version: 1, contentHash: "a".repeat(64) }],
      relations: [{ id: randomUUID(), kbId, schema: { namespace: schema.namespace, schemaId: schema.schemaId, version: schema.version }, type: "requires", sourceId: randomUUID(), targetId: randomUUID(),
        assertionIds: [randomUUID()], origin: "asserted" }] } };
}

test("release format round-trips mappings and manifest without sharing mutable caller state", () => {
  const command = fixture(), result = decodeSemanticRelease(command);
  assert.equal(result.entityTypes.get("legacy"), "object");
  assert.deepEqual(result.relations, command.payload.relations);
  assert.deepEqual(result.sources, command.payload.sources);
  command.payload.sources[0].version = 3;
  assert.equal(result.sources[0].version, 1);
});

test("release format refuses unsupported envelopes, lossy JSON and ambiguous mappings", () => {
  for (const mutate of [
    (p: Record<string, unknown>) => { p.format = "future"; },
    (p: Record<string, unknown>) => { p.schema = {}; },
    (p: Record<string, unknown>) => { p.entityTypes = [{ kind: "x", type: "missing" }]; },
    (p: Record<string, unknown>) => { p.entityTypes = [{ kind: "x", type: "object" }, { kind: "x", type: "object" }]; },
    (p: Record<string, unknown>) => { p.sources = []; },
    (p: Record<string, unknown>) => { p.extra = undefined; },
  ]) {
    const command = fixture(); mutate(command.payload as unknown as Record<string, unknown>);
    assert.throws(() => decodeSemanticRelease(command));
  }
});

test("release format blocks foreign libraries, stale schemas and non-asserted business edges", () => {
  for (const mutate of [
    (p: SemanticReleasePayload) => { p.relations[0].kbId = randomUUID(); },
    (p: SemanticReleasePayload) => { p.sources[0].kbId = randomUUID(); },
    (p: SemanticReleasePayload) => { p.relations[0].schema = { ...p.schema, version: "old" }; },
    (p: SemanticReleasePayload) => { p.relations[0].type = "unknown"; },
    (p: SemanticReleasePayload) => { p.relations[0].origin = "inferred"; },
    (p: SemanticReleasePayload) => { p.relations[0].origin = "suggested"; },
  ]) {
    const command = fixture(); mutate(command.payload);
    assert.throws(() => decodeSemanticRelease(command), /semantic_invalid_release/);
  }
});

test("release format rejects duplicate anchors/relations/grounds and invalid identifiers", () => {
  for (const mutate of [
    (p: SemanticReleasePayload) => { p.sources.push(p.sources[0]); },
    (p: SemanticReleasePayload) => { p.sources[0].version = 0; },
    (p: SemanticReleasePayload) => { p.sources[0].contentHash = "short"; },
    (p: SemanticReleasePayload) => { p.relations.push(p.relations[0]); },
    (p: SemanticReleasePayload) => { p.relations[0].assertionIds = []; },
    (p: SemanticReleasePayload) => { p.relations[0].assertionIds.push(p.relations[0].assertionIds[0]); },
    (p: SemanticReleasePayload) => { p.relations[0].sourceId = "not-a-uuid"; },
  ]) {
    const command = fixture(); mutate(command.payload);
    assert.throws(() => decodeSemanticRelease(command), /semantic_invalid_release/);
  }
});

test("schema comparison is order-independent but binds actual definitions and mappings", () => {
  const a = decodeSemanticRelease(fixture());
  a.schema.entityTypes.push("other"); a.entityTypes = new Map([...a.entityTypes, ["other-legacy", "other"]]);
  const b = structuredClone(a);
  b.schema.entityTypes.reverse(); b.entityTypes = new Map([...b.entityTypes].reverse());
  assert.equal(semanticDefinitionKey(a), semanticDefinitionKey(b));
  b.entityTypes = new Map([...b.entityTypes, ["legacy", "other"]]);
  assert.notEqual(semanticDefinitionKey(a), semanticDefinitionKey(b));
  b.entityTypes = new Map(a.entityTypes); b.schema.relationTypes[0].targetTypes.push("other");
  assert.notEqual(semanticDefinitionKey(a), semanticDefinitionKey(b));
});

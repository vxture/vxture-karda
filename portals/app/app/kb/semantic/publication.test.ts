import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePublication, type PublicationCommand } from "./publication";
import { PostgresPublicationProtocol } from "./publication-postgres";
import { Pool } from "pg";

function command(payload: unknown = { entities: [] }): PublicationCommand {
  return { kbId: randomUUID(), eventId: randomUUID(), expectedGeneration: 0,
    sourceRevision: "source-1", reviewRevision: "review-1", schemaRevision: "schema-1", payload };
}

test("publication fingerprint binds all inputs but ignores object key ordering", () => {
  const input = command({ b: 2, a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  const prepared = preparePublication(input);
  assert.equal(prepared.fingerprint, preparePublication({ ...input, payload: { a: (input.payload as { a: number[] }).a, b: 2 } }).fingerprint);
  assert.deepEqual(prepared.command.payload, input.payload);
  for (const field of ["sourceRevision", "reviewRevision", "schemaRevision"] as const) {
    assert.notEqual(prepared.fingerprint, preparePublication({ ...input, [field]: "changed" }).fingerprint);
  }
  assert.notEqual(prepared.fingerprint, preparePublication({ ...input, expectedGeneration: 1 }).fingerprint);
  assert.notEqual(prepared.fingerprint, preparePublication({ ...input, payload: { b: 3 } }).fingerprint);
  (input.payload as { b: number }).b = 10;
  assert.equal((prepared.command.payload as { b: number }).b, 2);
});

test("publication rejects lossy JSON, cycles, accessors and oversized inputs", () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const sparse = new Array(2);
  const hidden = Object.defineProperty({}, "secret", { value: 1 });
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { throw new Error("must_not_execute"); } });
  for (const payload of [undefined, NaN, Infinity, 1n, () => 1, new Date(), cycle, sparse, hidden, accessor, { x: undefined }, { [Symbol()]: 1 }]) {
    assert.throws(() => preparePublication({ ...command(), payload }), /publication_invalid_json/);
  }
  assert.throws(() => preparePublication(command("x".repeat(262144))), /publication_payload_limit/);
  assert.throws(() => preparePublication(command(Array(30001).fill(null))), /publication_payload_limit/);
  let nested: unknown = null; for (let i = 0; i < 66; i++) nested = [nested];
  assert.throws(() => preparePublication(command(nested)), /publication_payload_limit/);
});

test("publication validates identifiers, generation, revisions and sandbox namespace", () => {
  for (const expectedGeneration of [-1, 1.5, NaN, 2147483647]) {
    assert.throws(() => preparePublication({ ...command(), expectedGeneration }), /publication_invalid_command/);
  }
  assert.throws(() => preparePublication({ ...command(), kbId: "not-a-uuid" }), /publication_invalid_command/);
  assert.throws(() => preparePublication({ ...command(), sourceRevision: "" }), /publication_invalid_revision/);
  assert.throws(() => new PostgresPublicationProtocol({} as Pool, "public", async () => { throw new Error(); }), /publication_sandbox_required/);
});

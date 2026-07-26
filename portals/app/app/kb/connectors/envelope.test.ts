import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvelope } from "./envelope";

test("a valid upsert with inline bytes parses", () => {
  const r = parseEnvelope({
    binding_id: "bnd1",
    event: "upsert",
    source_doc_id: "doc-7",
    content_hash: "sha256:abc",
    source_ref: { uri: "arda://x", external_version: "3" },
    content: { mime: "text/plain", size: 12, bytes: "aGVsbG8=" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.event, "upsert");
  assert.equal(r.value.sourceDocId, "doc-7");
  assert.equal(r.value.contentHash, "sha256:abc");
  assert.equal(r.value.sourceRef?.externalVersion, "3");
  assert.equal(r.value.content?.bytes, "aGVsbG8=");
});

test("a valid upsert with a fetch_ref parses (fetch=ref)", () => {
  const r = parseEnvelope({ binding_id: "b", event: "upsert", source_doc_id: "d", content_hash: "h", content: { fetch_ref: "arda://content/tok" } });
  assert.ok(r.ok);
  assert.equal(r.value.content?.fetchRef, "arda://content/tok");
});

test("upsert content must be exactly one of bytes / fetch_ref", () => {
  const neither = parseEnvelope({ binding_id: "b", event: "upsert", source_doc_id: "d", content_hash: "h", content: {} });
  assert.ok(!neither.ok);
  const both = parseEnvelope({ binding_id: "b", event: "upsert", source_doc_id: "d", content_hash: "h", content: { bytes: "x", fetch_ref: "y" } });
  assert.ok(!both.ok);
  assert.match(both.error, /XOR/);
});

test("upsert requires a content_hash (the change key)", () => {
  const r = parseEnvelope({ binding_id: "b", event: "upsert", source_doc_id: "d", content: { bytes: "x" } });
  assert.ok(!r.ok);
  assert.match(r.error, /content_hash/);
});

test("a delete carries only the stable id - no hash, no content", () => {
  const r = parseEnvelope({ binding_id: "b", event: "delete", source_doc_id: "gone" });
  assert.ok(r.ok);
  assert.equal(r.value.event, "delete");
  assert.equal(r.value.contentHash, null);
  assert.equal(r.value.content, null);
});

test("binding_id, source_doc_id and a known event are required", () => {
  assert.ok(!parseEnvelope({ event: "upsert", source_doc_id: "d", content_hash: "h", content: { bytes: "x" } }).ok);
  assert.ok(!parseEnvelope({ binding_id: "b", event: "upsert", content_hash: "h", content: { bytes: "x" } }).ok);
  assert.ok(!parseEnvelope({ binding_id: "b", event: "sync", source_doc_id: "d" }).ok);
  assert.ok(!parseEnvelope("not-an-object").ok);
});

test("camelCase keys are accepted alongside snake_case", () => {
  const r = parseEnvelope({ bindingId: "b", event: "upsert", sourceDocId: "d", contentHash: "h", content: { bytes: "x" } });
  assert.ok(r.ok);
  assert.equal(r.value.bindingId, "b");
});

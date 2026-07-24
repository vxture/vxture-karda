import { test } from "node:test";
import assert from "node:assert/strict";
import { PROCESSING_PRESETS, CONTENT_PRESETS } from "./presets";
import { FIELD_NAME_RE, METADATA_VALUE_TYPES } from "./metadata";

// These validate the presets against the same rules the runtime enforces, so a
// malformed preset is caught here rather than as an opaque insert failure during
// seed. The presets are data, but data that must satisfy the schema's checks.

test("the six processing presets are exactly the design's set", () => {
  assert.deepEqual(
    PROCESSING_PRESETS.map((t) => t.templateCode).sort(),
    ["general", "legal", "manual", "paper", "qa", "table"],
  );
});

test("processing presets carry the KD-007 chunk defaults", () => {
  for (const t of PROCESSING_PRESETS) {
    assert.equal(t.defaultParams.targetTokens, 512);
    assert.equal(t.defaultParams.maxTokens, 1024);
    assert.equal(t.defaultParams.overlap, 0);
  }
});

test("template codes are unique within each family", () => {
  const proc = PROCESSING_PRESETS.map((t) => t.templateCode);
  assert.equal(new Set(proc).size, proc.length);
  const cont = CONTENT_PRESETS.map((t) => t.templateCode);
  assert.equal(new Set(cont).size, cont.length);
});

test("the three v1 content presets are FAQ / glossary / SOP (KD-002)", () => {
  assert.deepEqual(CONTENT_PRESETS.map((t) => t.templateCode).sort(), ["faq", "glossary", "sop"]);
});

test("every content-field name is a legal snake-case identifier", () => {
  for (const ct of CONTENT_PRESETS) {
    for (const f of ct.fields) {
      assert.ok(FIELD_NAME_RE.test(f.fieldName), `${ct.templateCode}.${f.fieldName}`);
    }
  }
});

test("field names are unique within a template, positions are distinct", () => {
  for (const ct of CONTENT_PRESETS) {
    const names = ct.fields.map((f) => f.fieldName);
    assert.equal(new Set(names).size, names.length, `${ct.templateCode} field names`);
    const pos = ct.fields.map((f) => f.position);
    assert.equal(new Set(pos).size, pos.length, `${ct.templateCode} positions`);
  }
});

test("enum fields carry values and non-enum fields do not", () => {
  for (const ct of CONTENT_PRESETS) {
    for (const f of ct.fields) {
      const hasEnum = Array.isArray(f.enumValues) && f.enumValues.length > 0;
      assert.equal(f.valueType === "enum", hasEnum, `${ct.templateCode}.${f.fieldName}`);
    }
  }
});

test("every template has at least one search_text field, or it is unsearchable", () => {
  for (const ct of CONTENT_PRESETS) {
    assert.ok(
      ct.fields.some((f) => f.retrievalRole === "search_text"),
      `${ct.templateCode} has no search_text field`,
    );
  }
});

test("filterable content-field types are within the metadata value set", () => {
  // A filterable field becomes a filter index; richtext is not filterable-shaped.
  for (const ct of CONTENT_PRESETS) {
    for (const f of ct.fields) {
      if (f.retrievalRole === "filterable") {
        assert.ok(
          (METADATA_VALUE_TYPES as readonly string[]).includes(f.valueType),
          `${ct.templateCode}.${f.fieldName} filterable but ${f.valueType}`,
        );
      }
    }
  }
});

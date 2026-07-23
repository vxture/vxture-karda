import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMetadataFields,
  countFilterable,
  remainingFilterableBudget,
  FILTERABLE_FIELD_CAP,
  SYSTEM_FILTERABLE_DIMENSIONS,
  type MetadataFieldDecl,
} from "./metadata";

const f = (
  fieldName: string,
  filterable = false,
  extra: Partial<MetadataFieldDecl> = {},
): MetadataFieldDecl => ({ fieldName, valueType: "string", filterable, ...extra });

test("fields are stored by default; filterable is opt-in", () => {
  const errs = validateMetadataFields([f("author"), f("department")]);
  assert.deepEqual(errs, []);
  assert.equal(countFilterable([f("author"), f("department")]), SYSTEM_FILTERABLE_DIMENSIONS.length);
});

test("system dimensions count against the cap", () => {
  // Otherwise a library declaring 16 business fields silently doubles the real
  // index cost.
  assert.equal(countFilterable([]), SYSTEM_FILTERABLE_DIMENSIONS.length);
  assert.equal(
    remainingFilterableBudget([]),
    FILTERABLE_FIELD_CAP - SYSTEM_FILTERABLE_DIMENSIONS.length,
  );
});

test("the cap is enforced, and the error says how far over it is", () => {
  const budget = remainingFilterableBudget([]);
  const ok = Array.from({ length: budget }, (_, i) => f(`biz_${i}`, true));
  assert.deepEqual(validateMetadataFields(ok), []);

  const over = [...ok, f("one_too_many", true)];
  const errs = validateMetadataFields(over);
  assert.equal(errs.length, 1);
  assert.deepEqual(errs[0], {
    code: "filterable_cap_exceeded",
    limit: FILTERABLE_FIELD_CAP,
    requested: FILTERABLE_FIELD_CAP + 1,
  });
});

test("non-filterable fields are unlimited - only index cost is capped", () => {
  const many = Array.from({ length: 200 }, (_, i) => f(`stored_${i}`, false));
  assert.deepEqual(validateMetadataFields(many), []);
});

test("the whole set is validated at once, so two additions cannot each pass", () => {
  // Validating one field at a time is how a cap gets bypassed by concurrent
  // single-field additions; the API takes the full set for exactly this reason.
  const budget = remainingFilterableBudget([]);
  const atCap = Array.from({ length: budget }, (_, i) => f(`biz_${i}`, true));
  assert.deepEqual(validateMetadataFields(atCap), []);
  assert.equal(validateMetadataFields([...atCap, f("extra", true)]).length, 1);
});

test("field names are lowercase snake and bounded", () => {
  assert.deepEqual(validateMetadataFields([f("ok_name_1")]), []);
  for (const bad of ["Upper", "1leading", "has-dash", "has space", "", "a".repeat(64)]) {
    const errs = validateMetadataFields([f(bad)]);
    assert.equal(errs[0]?.code, "invalid_field_name", `expected rejection for ${JSON.stringify(bad)}`);
  }
});

test("system dimension names cannot be redeclared as business fields", () => {
  for (const name of SYSTEM_FILTERABLE_DIMENSIONS) {
    const errs = validateMetadataFields([f(name, true)]);
    assert.equal(errs[0]?.code, "reserved_field_name");
  }
});

test("duplicate field names are rejected", () => {
  const errs = validateMetadataFields([f("author"), f("author")]);
  assert.equal(errs[0]?.code, "duplicate_field_name");
});

test("enum fields must carry values, and non-enum fields must not", () => {
  assert.equal(
    validateMetadataFields([f("kind", false, { valueType: "enum" })])[0]?.code,
    "enum_values_required",
  );
  assert.deepEqual(
    validateMetadataFields([f("kind", false, { valueType: "enum", enumValues: ["a", "b"] })]),
    [],
  );
  assert.equal(
    validateMetadataFields([f("n", false, { valueType: "number", enumValues: ["a"] })])[0]?.code,
    "enum_values_not_allowed",
  );
});

test("duplicate filterable names are counted once, not twice, against the cap", () => {
  const dup = [f("author", true), f("author", true)];
  assert.equal(countFilterable(dup), SYSTEM_FILTERABLE_DIMENSIONS.length + 1);
});

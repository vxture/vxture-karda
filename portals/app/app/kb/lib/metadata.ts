// Business-segment metadata rules from 100-kb-model section 4.3.
//
// The filterable whitelist is the point of this module. Fields are stored by
// default and only become filter indexes when explicitly declared, because in a
// multi-tenant system every filterable field is an index that someone pays for -
// which is why this differs from Dify's filter-anything model, built for a
// single tenant.
//
// The per-library cap lives here rather than in the DDL: a count constraint over
// sibling rows needs a trigger, and the cap is product policy that 100-kb-model
// section 11 already marks revisable. Baking it into the schema would make every
// adjustment a production structure change. That trade means THIS is the only
// thing standing between a caller and an unbounded index bill, so it is enforced
// on the write path and not merely documented.

export const METADATA_VALUE_TYPES = ["string", "number", "datetime", "enum"] as const;
export type MetadataValueType = (typeof METADATA_VALUE_TYPES)[number];

/** 100-kb-model 11 #2 (proposed 16, revisable). Counts system dimensions too. */
export const FILTERABLE_FIELD_CAP = 16;

/**
 * System dimensions that are always filterable and therefore always count
 * against the cap (100-kb-model 6, the fixed recall-filter set). A library
 * declaring 16 business fields on top of these would silently double the real
 * index cost, so they are counted rather than ignored.
 */
export const SYSTEM_FILTERABLE_DIMENSIONS = [
  "kb_id",
  "folder_id",
  "source",
  "content_state",
  "verification_state",
] as const;

export const FIELD_NAME_RE = /^[a-z][a-z0-9_]{0,62}$/;

export interface MetadataFieldDecl {
  fieldName: string;
  valueType: MetadataValueType;
  enumValues?: string[];
  filterable: boolean;
}

export type ValidationError =
  | { code: "invalid_field_name"; field: string }
  | { code: "reserved_field_name"; field: string }
  | { code: "duplicate_field_name"; field: string }
  | { code: "enum_values_required"; field: string }
  | { code: "enum_values_not_allowed"; field: string }
  | { code: "filterable_cap_exceeded"; limit: number; requested: number };

/**
 * Validate a library's full business-field declaration set.
 *
 * Takes the WHOLE set rather than one field at a time: the cap and the
 * duplicate check are both properties of the set, and validating incrementally
 * is how a cap gets bypassed by two concurrent single-field additions.
 */
export function validateMetadataFields(fields: MetadataFieldDecl[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();

  for (const f of fields) {
    if (!FIELD_NAME_RE.test(f.fieldName)) {
      errors.push({ code: "invalid_field_name", field: f.fieldName });
      continue;
    }
    if ((SYSTEM_FILTERABLE_DIMENSIONS as readonly string[]).includes(f.fieldName)) {
      errors.push({ code: "reserved_field_name", field: f.fieldName });
      continue;
    }
    if (seen.has(f.fieldName)) {
      errors.push({ code: "duplicate_field_name", field: f.fieldName });
      continue;
    }
    seen.add(f.fieldName);

    const hasEnum = Array.isArray(f.enumValues) && f.enumValues.length > 0;
    if (f.valueType === "enum" && !hasEnum) {
      errors.push({ code: "enum_values_required", field: f.fieldName });
    }
    if (f.valueType !== "enum" && hasEnum) {
      errors.push({ code: "enum_values_not_allowed", field: f.fieldName });
    }
  }

  const requested = countFilterable(fields);
  if (requested > FILTERABLE_FIELD_CAP) {
    errors.push({
      code: "filterable_cap_exceeded",
      limit: FILTERABLE_FIELD_CAP,
      requested,
    });
  }

  return errors;
}

/** Business filterable fields plus the system dimensions that always apply. */
export function countFilterable(fields: MetadataFieldDecl[]): number {
  const business = new Set(fields.filter((f) => f.filterable).map((f) => f.fieldName)).size;
  return business + SYSTEM_FILTERABLE_DIMENSIONS.length;
}

export function remainingFilterableBudget(fields: MetadataFieldDecl[]): number {
  return Math.max(0, FILTERABLE_FIELD_CAP - countFilterable(fields));
}

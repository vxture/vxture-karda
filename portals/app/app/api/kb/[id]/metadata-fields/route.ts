import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import {
  METADATA_VALUE_TYPES,
  FILTERABLE_FIELD_CAP,
  SYSTEM_FILTERABLE_DIMENSIONS,
  countFilterable,
  type MetadataFieldDecl,
  type MetadataValueType,
} from "../../../../kb/lib/metadata";
import { requireAuth, readJson } from "../../../../kb/api/http";

// GET /api/kb/:id/metadata-fields   the library's business field declarations
// PUT /api/kb/:id/metadata-fields   replace the whole declaration set
//
// PUT, not POST/PATCH/DELETE per field. Two independent reasons that point the
// same way, which is why this is the right shape rather than a shortcut:
//
//   1. The rules are SET properties. The filterable cap and the duplicate-name
//      check cannot be evaluated against one field in isolation, so a per-field
//      endpoint validates each addition against a set that does not yet contain
//      it - and two concurrent additions cross the cap together.
//   2. UPDATE is revoked on kb_metadata_field (98_column_locks), so the only
//      write the service role can perform IS delete-then-insert.
//
// The filterable whitelist is the whole point of the module (100-kb-model 4.3):
// fields are stored by default and become filter INDEXES only when declared,
// because in a multi-tenant system every filterable field is an index someone
// pays for. Until this route existed the rules were enforced by a validator no
// caller could reach.
export const dynamic = "force-dynamic";

function svc() {
  return new KbService(getKbStore());
}

async function scopedKbId(id: string, workspaceId: string): Promise<boolean> {
  const kb = await svc().get(id);
  return kb.ok && kb.value.workspaceId === workspaceId;
}

/** The budget a UI needs to render the whitelist honestly: system dimensions
 *  count against the cap, so showing "16 available" would overstate it by five. */
function budget(fields: MetadataFieldDecl[]) {
  const used = countFilterable(fields);
  return {
    cap: FILTERABLE_FIELD_CAP,
    used,
    remaining: Math.max(0, FILTERABLE_FIELD_CAP - used),
    systemDimensions: [...SYSTEM_FILTERABLE_DIMENSIONS],
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKbId(id, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const fields = await svc().listMetadataFields(id);
  return NextResponse.json({ fields, budget: budget(fields) });
}

/** Shape-check the wire payload before the domain validator sees it. This
 *  rejects wrong TYPES; validateMetadataFields judges the rules. Keeping them
 *  apart means the domain rules stay testable without a request. */
function parseFields(raw: unknown): MetadataFieldDecl[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MetadataFieldDecl[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const f = item as Record<string, unknown>;
    if (typeof f.fieldName !== "string") return null;
    if (typeof f.valueType !== "string" || !METADATA_VALUE_TYPES.includes(f.valueType as MetadataValueType)) return null;
    if (f.enumValues !== undefined) {
      if (!Array.isArray(f.enumValues) || f.enumValues.some((v) => typeof v !== "string")) return null;
    }
    out.push({
      fieldName: f.fieldName,
      valueType: f.valueType as MetadataValueType,
      enumValues: f.enumValues as string[] | undefined,
      // Absent means NOT filterable. Defaulting the other way would opt a
      // library into an index bill it never asked for.
      filterable: f.filterable === true,
    });
  }
  return out;
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKbId(id, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await readJson(req);
  const fields = parseFields(body.fields);
  if (fields === null) return NextResponse.json({ error: "invalid_fields" }, { status: 400 });

  const r = await svc().replaceMetadataFields(id, fields);
  if (!r.ok) {
    if (r.error.code !== "invalid_metadata_fields") {
      return NextResponse.json({ error: r.error.code }, { status: 404 });
    }
    // 422, not 400: the payload parsed fine, the DECLARATION is what is
    // rejected - and the per-field errors are what a form needs to render.
    return NextResponse.json({ error: r.error.code, errors: r.error.errors }, { status: 422 });
  }
  return NextResponse.json({ fields: r.value, budget: budget(r.value) });
}

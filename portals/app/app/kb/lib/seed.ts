// Idempotent seed of the factory-preset templates into karda_kb. INSERT-only:
// the template tables have no service-role UPDATE (98_column_locks), so seeding
// re-runs safely via ON CONFLICT DO NOTHING against the unique keys. Evolving a
// preset means a new version row, never a mutation of an existing one, so a
// no-op re-seed is exactly the right idempotency - it will not silently rewrite
// a template someone is already using.
import { getPrismaClient } from "../../lib/db";
import { PROCESSING_PRESETS, CONTENT_PRESETS } from "./presets";

export interface SeedResult {
  processingInserted: number;
  contentInserted: number;
  fieldsInserted: number;
}

export async function seedPresets(): Promise<SeedResult> {
  const p = await getPrismaClient();
  const result: SeedResult = { processingInserted: 0, contentInserted: 0, fieldsInserted: 0 };

  for (const t of PROCESSING_PRESETS) {
    const r = await p.processingTemplate.createMany({
      data: [{ templateCode: t.templateCode, name: t.name, defaultParams: t.defaultParams, isPreset: true }],
      skipDuplicates: true, // ON CONFLICT DO NOTHING on uidx_processing_template_code
    });
    result.processingInserted += r.count;
  }

  for (const ct of CONTENT_PRESETS) {
    // Find-or-create the template row, then its fields. createMany skipDuplicates
    // gives idempotency at each level independently, so a partially-seeded state
    // (template present, a field missing) self-heals on the next run.
    const existing = await p.contentTemplate.findFirst({
      where: { scope: "platform", workspaceId: null, templateCode: ct.templateCode, version: 1 },
    });
    let templateId: string;
    if (existing) {
      templateId = existing.id;
    } else {
      const created = await p.contentTemplate.create({
        data: { templateCode: ct.templateCode, name: ct.name, scope: "platform", version: 1 },
      });
      templateId = created.id;
      result.contentInserted += 1;
    }

    const r = await p.contentTemplateField.createMany({
      data: ct.fields.map((f) => ({
        templateId,
        fieldName: f.fieldName,
        valueType: f.valueType,
        required: f.required,
        retrievalRole: f.retrievalRole,
        position: f.position,
        enumValues: f.enumValues ?? undefined,
      })),
      skipDuplicates: true, // ON CONFLICT DO NOTHING on uidx_ct_field_template_name
    });
    result.fieldsInserted += r.count;
  }

  return result;
}

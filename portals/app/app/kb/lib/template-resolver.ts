// Content-template resolution: turn a stable template CODE (e.g. "faq") into the
// row identity an Entry must carry (content_template_id FK + version) plus the
// field contract used to validate the entry's shape. The tool surface and the
// Console both reference a template by its human code, never by an opaque row id,
// so this is the one place that bridges code -> row.
//
// v1 resolves platform-scope presets only (KD-002: FAQ / glossary / SOP). The
// validation contract comes from CONTENT_PRESETS - the same constants the seed
// path inserts - so a preset template validates identically whether or not a DB
// is attached. Org-authored templates (a later feature) will add a workspace-
// scoped lookup here; until then an unknown code resolves to null.
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { CONTENT_PRESETS, type ContentPreset } from "./presets";

export interface ResolvedContentTemplate {
  /** content_template.id - the FK an Entry stores. */
  id: string;
  version: number;
  /** the field contract used to validate the entry (validateEntryFields). */
  preset: ContentPreset;
}

export interface TemplateResolver {
  /** Resolve a content template by its stable code, or null if none is visible. */
  resolveContent(code: string): Promise<ResolvedContentTemplate | null>;
}

// --- offline / tests: resolve straight from the preset constants --------------

/**
 * The preset-only resolver: no DB, so the row id is a deterministic synthetic
 * (`ctpl_<code>`) and the version is 1. Sufficient for the offline path and tests
 * - the in-memory content store does not enforce the FK, and a preset is version
 * 1 by definition.
 */
export class PresetTemplateResolver implements TemplateResolver {
  async resolveContent(code: string): Promise<ResolvedContentTemplate | null> {
    const preset = CONTENT_PRESETS.find((p) => p.templateCode === code);
    if (!preset) return null;
    return { id: `ctpl_${code}`, version: 1, preset };
  }
}

// --- Prisma: the real row id from the seeded content_template ------------------

/**
 * Resolve the seeded platform-scope row for a preset code, taking the highest
 * version (a preset evolves by adding a version row, never mutating one). The
 * validation contract still comes from CONTENT_PRESETS - v1 only accepts codes we
 * ship, so a code with no matching preset resolves to null before the DB is even
 * queried.
 */
export class PrismaTemplateResolver implements TemplateResolver {
  async resolveContent(code: string): Promise<ResolvedContentTemplate | null> {
    const preset = CONTENT_PRESETS.find((p) => p.templateCode === code);
    if (!preset) return null;
    const p = await getPrismaClient();
    const row = await p.contentTemplate.findFirst({
      where: { scope: "platform", workspaceId: null, templateCode: code },
      orderBy: { version: "desc" },
    });
    if (!row) return null;
    return { id: row.id, version: row.version, preset };
  }
}

export function getTemplateResolver(): TemplateResolver {
  return prismaEnabled() ? new PrismaTemplateResolver() : new PresetTemplateResolver();
}

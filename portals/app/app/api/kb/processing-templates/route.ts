import { NextResponse } from "next/server";
import { prismaEnabled, getPrismaClient } from "../../../lib/db";
import { PROCESSING_PRESETS } from "../../../kb/lib/presets";
import { requireAuth } from "../../../kb/api/http";

// GET /api/kb/processing-templates   the chunking templates a library can pick
//
// Returns DB ids, not just codes, and that is the reason this route has to
// exist at all: `knowledge_base.processing_template_id` is a UUID FK, so a
// picker built from the PROCESSING_PRESETS constants alone would have nothing
// to PATCH with. The presets supply the human-readable half (name, chunking
// params); the DB supplies identity.
//
// The catalog is platform-wide, not per-workspace: v1 lets an org tune params
// but not author templates (110-processing), and `is_preset` defaults true.
// Auth is still required - an unauthenticated caller has no library to set it
// on, and this is the shape every other kb route uses.
//
// Offline (no DATABASE_URL) it serves the presets with `id: null` so the
// verification pages render the real six rather than an empty list; a null id
// simply cannot be selected.
export const dynamic = "force-dynamic";

export interface ProcessingTemplateOption {
  id: string | null;
  templateCode: string;
  name: string;
  targetTokens: number;
  maxTokens: number;
  note: string;
}

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const byCode = new Map(PROCESSING_PRESETS.map((t) => [t.templateCode, t]));

  if (!prismaEnabled()) {
    return NextResponse.json({
      templates: PROCESSING_PRESETS.map((t) => ({
        id: null,
        templateCode: t.templateCode,
        name: t.name,
        targetTokens: t.defaultParams.targetTokens,
        maxTokens: t.defaultParams.maxTokens,
        note: t.defaultParams.note,
      })),
    });
  }

  const p = await getPrismaClient();
  const rows = await p.processingTemplate.findMany({ orderBy: [{ templateCode: "asc" }, { version: "desc" }] });

  // Rows the seed has not described are still listed - a template present in the
  // DB but absent from PROCESSING_PRESETS is a real option a library may already
  // be using, and dropping it from the picker would present that library as
  // having no template at all.
  const templates: ProcessingTemplateOption[] = rows.map((r) => {
    const preset = byCode.get(r.templateCode);
    const params = (r.defaultParams ?? {}) as Record<string, unknown>;
    const num = (k: string, fallback: number) => (typeof params[k] === "number" ? (params[k] as number) : fallback);
    return {
      id: r.id,
      templateCode: r.templateCode,
      name: r.name,
      targetTokens: num("targetTokens", preset?.defaultParams.targetTokens ?? 512),
      maxTokens: num("maxTokens", preset?.defaultParams.maxTokens ?? 1024),
      note: typeof params.note === "string" ? params.note : (preset?.defaultParams.note ?? ""),
    };
  });

  return NextResponse.json({ templates });
}

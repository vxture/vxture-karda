import { NextResponse } from "next/server";
import { prismaEnabled, getPrismaClient } from "../../../../lib/db";
import { seedPresets } from "../../../../kb/lib/seed";
import { DEMO_ASSETS, demoTitle } from "../../../../kb/demo/seed-data";
import { devLoginEnabled, DEV_DEFAULTS } from "../../../../auth/lib/dev-login";
import { getOidcConfig } from "../../../../auth/lib/config";

// POST /api/kb/admin/seed-demo: write the demo/seed content set (six knowledge
// assets with their documents and entries) into karda_kb, for the 资产总览
// milestone. Gated like the other privileged runtime acts:
//   - x-internal-job-token (operator / runbook), OR
//   - the dev-login gate (local development only - AUTH_DEV_LOGIN=on, no RP,
//     not production), because this is exactly the environment the demo data
//     is for.
//
// Idempotent per asset: an asset whose name already exists in the target
// workspace is topped up only if its row counts are below the spec (partial
// seeds self-heal); existing rows are never mutated or deleted.
export const dynamic = "force-dynamic";

interface SeededAsset {
  name: string;
  kbId: string;
  documentsInserted: number;
  entriesInserted: number;
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const tokenOk = Boolean(expected) && req.headers.get("x-internal-job-token") === expected;
  const devOk = devLoginEnabled(getOidcConfig().enabled);
  if (!tokenOk && !devOk) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!prismaEnabled()) {
    return NextResponse.json({ error: "no_database", detail: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : DEV_DEFAULTS.ws;
  const seederSub = typeof body.sub === "string" ? body.sub : DEV_DEFAULTS.sub;

  // Presets first: entries need a content template to reference.
  await seedPresets();
  const p = await getPrismaClient();
  const template = await p.contentTemplate.findFirst({
    where: { scope: "platform", workspaceId: null, templateCode: "general", version: 1 },
  });
  if (!template) {
    return NextResponse.json({ error: "no_content_template" }, { status: 500 });
  }

  const results: SeededAsset[] = [];
  for (const spec of DEMO_ASSETS) {
    let kb = await p.knowledgeBase.findFirst({
      where: { workspaceId, name: spec.name, deletedAt: null },
    });
    if (!kb) {
      kb = await p.knowledgeBase.create({
        data: {
          workspaceId,
          ownerType: spec.ownerType,
          ownerSub: spec.ownerType === "user" ? (spec.ownerSub ?? seederSub) : spec.ownerSub,
          name: spec.name,
          description: spec.description,
          publishState: spec.publishState,
        },
      });
    }

    const seeded: SeededAsset = { name: spec.name, kbId: kb.id, documentsInserted: 0, entriesInserted: 0 };

    // Documents: top up to the spec count. Verification and content states are
    // assigned deterministically by ordinal so re-runs converge on the same
    // distribution.
    const haveDocs = await p.document.count({ where: { kbId: kb.id } });
    if (haveDocs < spec.docCount) {
      const verifiedTarget = Math.round((spec.verifiedPct / 100) * spec.docCount);
      const rows = [];
      for (let i = haveDocs; i < spec.docCount; i++) {
        let contentState = "indexed";
        if (spec.processing) {
          if (i >= spec.processing.indexed + spec.processing.processing) contentState = "draft"; // parked
          else if (i >= spec.processing.indexed) contentState = "processing";
        }
        rows.push({
          kbId: kb.id,
          title: demoTitle(spec.docTitleStems, i),
          mime: "application/pdf",
          source: spec.source === "sync" ? "connector" : "upload",
          connectorCode: spec.source === "sync" ? "arda" : null,
          contentState,
          verificationState: contentState === "indexed" && i < verifiedTarget ? "verified" : "unverified",
          verifier: contentState === "indexed" && i < verifiedTarget ? "verifier-demo" : null,
          verifiedAt: contentState === "indexed" && i < verifiedTarget ? new Date() : null,
          createdBy: seederSub,
        });
      }
      const r = await p.document.createMany({ data: rows });
      seeded.documentsInserted = r.count;
    }

    // Entries: same top-up strategy; the leading staleEntries rows carry
    // verification_state = "stale" (待复验), the next block "verified".
    const haveEntries = await p.entry.count({ where: { kbId: kb.id } });
    if (haveEntries < spec.entryCount) {
      const verifiedTarget = Math.round((spec.verifiedPct / 100) * spec.entryCount);
      const rows = [];
      for (let i = haveEntries; i < spec.entryCount; i++) {
        const stale = i < spec.staleEntries;
        const verified = !stale && i < spec.staleEntries + verifiedTarget;
        rows.push({
          kbId: kb.id,
          title: demoTitle(spec.entryTitleStems, i),
          contentTemplateId: template.id,
          fields: { body: `${demoTitle(spec.entryTitleStems, i)}(seed-demo 条目正文)` },
          contentState: "indexed",
          verificationState: stale ? "stale" : verified ? "verified" : "unverified",
          verifier: verified ? "verifier-demo" : null,
          verifiedAt: verified ? new Date() : null,
          createdBy: seederSub,
        });
      }
      const r = await p.entry.createMany({ data: rows });
      seeded.entriesInserted = r.count;
    }

    results.push(seeded);
  }

  return NextResponse.json({ workspaceId, seeded: results });
}

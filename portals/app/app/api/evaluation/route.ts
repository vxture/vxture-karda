import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled } from "../../lib/db";
import { readCorpus } from "../../kb/governance/corpus-read";
import { DEMO_EVALUATION } from "../../kb/demo/evaluation-demo";
import type { EvaluationData } from "../../kb/demo/evaluation-types";

// GET /api/evaluation - the 验证评测 read model.
//
// The page has two halves and they do NOT share a data source, so the payload
// carries a per-group provenance marker instead of one page-wide flag:
//
//   验证治理 (corpus)     LIVE off document/entry verification_state - see
//                        kb/governance/corpus-read.ts. Needed no new table.
//   管家预验 (steward)    demo. No steward ledger yet.
//   质量评测 (evaluation) demo. No evaluation runner yet (KD-011 ruled out
//                        synthetic QA generation for v1 - sets are authored).
//
// Without a DB attached the whole payload falls back to the demo overlay, same
// contract as every other read model here.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    const data: EvaluationData = {
      ...DEMO_EVALUATION,
      sources: { corpus: "demo", steward: "demo", evaluation: "demo" },
    };
    return NextResponse.json(data);
  }

  const corpus = await readCorpus(auth.user.activeWorkspace);
  const data: EvaluationData = {
    ...DEMO_EVALUATION,
    verification: {
      ...corpus,
      // Steward figure, not a corpus figure - stays on the overlay until a
      // steward ledger exists. sources.steward says so.
      preVerifiedPending: DEMO_EVALUATION.verification.preVerifiedPending,
    },
    sources: { corpus: "live", steward: "demo", evaluation: "demo" },
  };
  return NextResponse.json(data);
}

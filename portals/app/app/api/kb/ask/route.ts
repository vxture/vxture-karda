import { NextResponse } from "next/server";
import { requireAuth, readJson } from "../../../kb/api/http";
import { consoleAsk } from "../../../kb/retrieval/console-retrieval";
import { getVisibleSetResolver } from "../../../kb/retrieval/visible-set";
import { getKbStore } from "../../../kb/lib/store";
import { getRecallCorpus, getRecallTextResolver } from "../../../kb/retrieval/corpus";
import { getGenerationClient, askModelSelection } from "../../../kb/retrieval/generation";

// POST /api/kb/ask   (session) - the Console cited-answer surface over the same
// scope rules as /api/kb/search. Honest 501 while Atlas A4 is unconfigured
// (mirrors karda.ask); generation costs meter at Atlas under this call's
// taskId, attributed to the workspace.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "question_required" }, { status: 400 });
  }

  const result = await consoleAsk(
    { org: auth.user.activeOrg, ws: auth.user.activeWorkspace, user: auth.user.sub },
    body,
    {
      visibleSet: getVisibleSetResolver(getKbStore()),
      corpus: getRecallCorpus(),
      texts: getRecallTextResolver(),
      generation: getGenerationClient(),
      ...askModelSelection(),
    },
  );
  if ("notConfigured" in result) {
    return NextResponse.json(
      { error: "not_configured", detail: "generation (Atlas A4) is not configured" },
      { status: 501 },
    );
  }
  return NextResponse.json({ result });
}

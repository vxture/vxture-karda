import { NextResponse } from "next/server";
import { requireAuth, readJson } from "../../../kb/api/http";
import { consoleSearch } from "../../../kb/retrieval/console-retrieval";
import { getVisibleSetResolver } from "../../../kb/retrieval/visible-set";
import { getKbStore } from "../../../kb/lib/store";
import { getRecallCorpus, getRecallTextResolver } from "../../../kb/retrieval/corpus";

// POST /api/kb/search   (session) - the Console search / recall-test surface.
//
// Scope = the session user's visible libraries (optionally narrowed by kb_ids);
// visibility gates every id server-side, so the body can only narrow. Not
// metered as karda.search - this is karda's own first-party surface, not an
// agent consuming the tool face (console-retrieval.ts carries the rationale).
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  if (typeof body.query !== "string" || !body.query.trim()) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }

  const result = await consoleSearch(
    { org: auth.user.activeOrg, ws: auth.user.activeWorkspace, user: auth.user.sub },
    body,
    {
      visibleSet: getVisibleSetResolver(getKbStore()),
      corpus: getRecallCorpus(),
      texts: getRecallTextResolver(),
    },
  );
  return NextResponse.json({ result });
}

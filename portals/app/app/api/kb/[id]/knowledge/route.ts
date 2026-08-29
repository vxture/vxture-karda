import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { requireAuth, readJson } from "../../../../kb/api/http";
import {
  readLibraryKnowledge,
  confirmAssertions,
  discardAssertions,
  adjudicate,
  confirmationExpiry,
} from "../../../../kb/assertions/curate";
import type { KnowledgeBaseRow } from "../../../../kb/lib/store";
import type { AuthUser } from "../../../../auth/lib/claims";

// GET  /api/kb/:id/knowledge   卡尔达在这个库上的抽取产出(草稿/已收录/实体/冲突)
// POST /api/kb/:id/knowledge   处置动作:confirm / discard / adjudicate(KD-222)
//
// 三个写动作走同一个 POST 而不是三条路由,因为它们共享的不只是鉴权:**到期钟的
// 口径**(confirmationExpiry,读库的治理配置)必须在一处算——confirm 和 adjudicate
// 各自算一遍,迟早算出两个不同的钟。
//
// 与同目录其他路由同一条规矩:库必须在调用方的活动工作区里,否则读成 not_found。
export const dynamic = "force-dynamic";

async function scoped(
  id: string,
  user: AuthUser & { activeWorkspace: string },
): Promise<KnowledgeBaseRow | null> {
  const r = await new KbService(getKbStore()).get(id);
  if (!r.ok || r.value.workspaceId !== user.activeWorkspace) return null;
  return r.value;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scoped(id, auth.user))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ knowledge: await readLibraryKnowledge(id) });
}

function idList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scoped(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await readJson(req);
  const expiresAt = confirmationExpiry(kb, new Date());

  if (body.action === "confirm") {
    const ids = idList(body.ids);
    if (ids.length === 0) return NextResponse.json({ error: "ids_required" }, { status: 400 });
    // 实际改动数照实返回:请求 5 条、改动 3 条意味着有 2 条已不在可确认状态
    // (被并发裁决/删除)。界面按差额告知,而不是这里悄悄凑成成功。
    const confirmed = await confirmAssertions(id, ids, auth.user.sub, expiresAt);
    return NextResponse.json({ confirmed, requested: ids.length });
  }

  if (body.action === "discard") {
    const ids = idList(body.ids);
    if (ids.length === 0) return NextResponse.json({ error: "ids_required" }, { status: 400 });
    const discarded = await discardAssertions(id, ids);
    return NextResponse.json({ discarded, requested: ids.length });
  }

  if (body.action === "adjudicate") {
    const winnerId = typeof body.winnerId === "string" ? body.winnerId : "";
    const loserIds = idList(body.loserIds);
    if (!winnerId || loserIds.length === 0) {
      return NextResponse.json({ error: "winner_and_losers_required" }, { status: 400 });
    }
    const r = await adjudicate(id, winnerId, loserIds, auth.user.sub, expiresAt);
    // 整批拒绝(混入外库 id / 赢家已不在)以 409 报出:这不是「没找到库」,
    // 是「裁决对象已经不是你看到的那个样子」——界面收到后应当刷新再判。
    if (r.confirmed === 0) return NextResponse.json({ error: "adjudication_stale" }, { status: 409 });
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

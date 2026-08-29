import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { requireAuth } from "../../../../kb/api/http";
import { readLibraryKarda } from "../../../../kb/assertions/library-read";

// GET /api/kb/:id/karda   卡尔达在这个库上的产出(断言 / 实体 / 最近抽取)
//
// 补这条路由是为了填上 `LifecycleStrip` 里缺的「抽取」那一段——当时缺它不是因为没
// 数据,是因为**没有库级的读端点**,而按现有数据硬凑一个数会是编的。
//
// 与同目录其他路由同一条规矩:库必须在调用方的活动工作区里。知道一个 id 不构成授权,
// 别的工作区的库必须读成 not_found,而不是「无权」——后者是一个可以用来枚举 id 的
// 神谕。
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ karda: await readLibraryKarda(id) });
}

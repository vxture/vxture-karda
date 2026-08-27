import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { readReadiness } from "../../kb/home/store";

// GET /api/home - 首页的可用性判断。
//
// 首页问三个问题(150-page-architecture §2.4):能不能用 / 谁在用 / 可不可信。
// 后两个已经有读模型(`/api/shell` 聚合了四个域),**只有第一个此前没有任何来源**
// ——而它恰好是首页存在的理由。这个端点只回答第一个。
//
// 为什么不并进 `/api/shell`:那个端点是导航卡片的数据,首页的可用性是一个判断而不是
// 一组数。两者的失效方式也不同——可用性算错会让人相信一个不能用的系统能用,而卡片
// 数字算错只是数字不好看。分开之后可以单独测、单独改。
//
// 会话面,按 activeWorkspace 收口,与其他读模型一致。
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const readiness = await readReadiness(auth.user.activeWorkspace ?? "");
  return NextResponse.json({ readiness });
}

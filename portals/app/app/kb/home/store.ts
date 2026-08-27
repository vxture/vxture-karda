// 首页可用性的数据侧。
//
// 一次调用回答一个问题:这个工作区此刻能不能用。查询按工作区收口——与全站同一条
// 纪律:任何一个会话能触发的读,都只能看见自己工作区的东西。

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { assessReadiness, type Readiness, type ReadinessInput } from "./readiness";

const EMPTY: ReadinessInput = {
  retrievable: 0,
  documents: 0,
  parkedUnavailable: 0,
  parkedQuota: 0,
  failedResident: 0,
  inflight: 0,
};

/**
 * 取这个工作区的可用性。
 *
 * 离线(无 DB)时返回 `empty` 而不是假装 ready:**首页最不该做的事就是在一个什么
 * 都没有的环境里说「一切正常」**。
 */
export async function readReadiness(workspaceId: string): Promise<Readiness> {
  if (!prismaEnabled() || !workspaceId) return assessReadiness(EMPTY);

  const p = await getPrismaClient();
  const kbs = await p.knowledgeBase.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true },
  });
  const kbIds = kbs.map((k) => k.id);
  // 空作用域算零,不是算全部——与 `sweepUngrounded` 的 `SweepScope` 同一条道理:
  // 「没有库」和「所有库」在查询里长得太像,而错的那一侧会读到别人的数据。
  if (kbIds.length === 0) return assessReadiness(EMPTY);

  // `Document` 没有 `deleted_at`——软删是 `content_state = 'deleted'`。
  //
  // 第一版这里写的是 `deletedAt: null`,而它**通过了类型检查**:对象先赋给变量、
  // 再 spread 进 `where`,spread 不做多余属性检查。运行时 Prisma 直接抛
  // `Unknown argument deletedAt`。
  //
  // 更值得记的是它**为什么差点没被发现**:第一次点开时种子数据落在另一个工作区,
  // `kbIds` 为空、函数提前返回,这一行根本没执行——页面显示「还没有内容」,看起来
  // 完全正常。工作区对上之后才 500。
  const docWhere = { kbId: { in: kbIds }, contentState: { not: "deleted" } };
  const taskWhere = { kbId: { in: kbIds } };

  const [retrievable, documents, parkedUnavailable, parkedQuota, failedResident, inflight] = await Promise.all([
    // 「可检索」的定义与检索侧一致:内容状态 indexed,且有一个 active 的分块版本。
    // 少了后一条会把「提交失败但状态没回滚」的文档算进来,那正是这一屏要暴露的东西。
    p.document.count({ where: { ...docWhere, contentState: "indexed", activeChunkVersion: { not: null } } }),
    p.document.count({ where: docWhere }),
    p.processingTask.count({ where: { ...taskWhere, state: "suspended", failureClass: "unavailable" } }),
    p.processingTask.count({ where: { ...taskWhere, state: "suspended", failureClass: "quota" } }),
    p.processingTask.count({ where: { ...taskWhere, state: "failed" } }),
    p.processingTask.count({ where: { ...taskWhere, state: { in: ["queued", "running"] } } }),
  ]);

  return assessReadiness({ retrievable, documents, parkedUnavailable, parkedQuota, failedResident, inflight });
}

import { getPrismaClient, prismaEnabled } from "../../lib/db";

// 卡尔达在**一个工作区**上的产出汇总——总览页「卡尔达 · 今日」卡与外壳导航卡的
// 数据源。
//
// 在此之前这几个数是演示口径(`DEMO_TOTALS_OPS.agent`):首页和总览把编的数字印在
// 人要据以判断的位置上,而确认台(KD-222)落地后,真数**就在库里**。同一个数字先有
// 真值再继续用演示值,比一开始就用演示值更糟——它从「还没建」变成了「懒得接」。
//
// 与 `library-read.ts`(单库)/`curate.ts`(确认台)的分工:这里只出**工作区级
// 计数**,不出明细——明细永远在每个库自己的确认台上,这里的数字只负责把人送过去。

export interface WorkspaceKarda {
  /** 待确认:草稿且未被裁决取代——每个库确认台队列的总和。 */
  pending: number;
  /** 互相矛盾的断言组数(同库、同 subject、不同 statement)。 */
  conflictGroups: number;
  /** 已收录且未被取代——可被检索与供给引用的知识量。 */
  admitted: number;
  /** 回流草稿:agent 经写入面沉淀、还停在草稿态的**条目**。与断言是两条线——
   *  一个是卡尔达抽的,一个是 agent 写的,都等着人看。 */
  refluxDrafts: number;
}

export function emptyWorkspaceKarda(): WorkspaceKarda {
  return { pending: 0, conflictGroups: 0, admitted: 0, refluxDrafts: 0 };
}

/** 冲突分组扫描的行上限。超出时组数是**下界**——宁可少报也不扫全表;总览卡上的
 *  这个数字是路标不是账本,账本在每个库的确认台上。 */
export const CONFLICT_SCAN_CAP = 5_000;

/**
 * 数冲突组:同库、同 subject(大小写与两端空白不敏感)、至少两个不同 statement。
 *
 * 与 `curate.groupConflicts` 同一条判定,但**只数不装**:这里要的是一个计数,把
 * 每组的完整断言都抬进内存再取长度,是为一个数字付一份明细的价。纯函数,边界不
 * 需要数据库就能测。分组键用换行拼接 kbId 与 subject——换行不可能出现在 uuid 里,
 * 空格可以出现在 subject 里。
 */
export function countConflictGroups(
  rows: { kbId: string; subject: string | null; statement: string }[],
): number {
  const statementsByGroup = new Map<string, Set<string>>();
  for (const r of rows) {
    const subject = r.subject?.trim().toLowerCase();
    if (!subject) continue; // 空或全空白的 subject 没有「同一件事」可言
    const key = r.kbId + "\n" + subject;
    if (!statementsByGroup.has(key)) statementsByGroup.set(key, new Set());
    statementsByGroup.get(key)!.add(r.statement);
  }
  let groups = 0;
  for (const set of statementsByGroup.values()) if (set.size >= 2) groups += 1;
  return groups;
}

export async function readWorkspaceKarda(workspaceId: string): Promise<WorkspaceKarda> {
  if (!prismaEnabled() || !workspaceId) return emptyWorkspaceKarda();
  const p = await getPrismaClient();
  const kbScope = { knowledgeBase: { workspaceId, deletedAt: null as Date | null } };

  const [byState, conflictRows, refluxDrafts] = await Promise.all([
    p.assertion.groupBy({
      by: ["contentState"],
      where: { kb: { workspaceId, deletedAt: null }, supersededById: null },
      _count: { _all: true },
    }),
    p.assertion.findMany({
      where: {
        kb: { workspaceId, deletedAt: null },
        supersededById: null,
        contentState: { not: "deleted" },
        subject: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: CONFLICT_SCAN_CAP,
      select: { kbId: true, subject: true, statement: true },
    }),
    p.entry.count({ where: { ...kbScope, contentState: "draft" } }),
  ]);

  const count = (state: string): number =>
    byState.find((r) => r.contentState === state)?._count._all ?? 0;

  return {
    pending: count("draft"),
    admitted: count("indexed"),
    conflictGroups: countConflictGroups(conflictRows),
    refluxDrafts,
  };
}

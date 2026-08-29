import { getPrismaClient, prismaEnabled } from "../../lib/db";

// 卡尔达在**一个库**上的产出:断言、实体、最近一次抽取。
//
// 为什么现在补这个:`LifecycleStrip` 上五条业务流缺了「抽取」那一段,而当时的注释
// 写着「没有库级的断言/冲突读端点,按现有数据硬凑一个数会是编的——缺一段比编一段
// 好,补上端点之后再加」。这就是那个端点。
//
// 它读的两列都带索引(`idx_assertion_kb_content` / `idx_assertion_kb_verification`),
// 所以是三次 groupBy 加两次 count,没有一次全表扫描。
//
// **不算的东西**,同样是刻意的:
//
//   · 「待裁决的冲突」不在这里。冲突是同一 subject 上互相矛盾的一**组**断言
//     (`overlap.ts`),判断它需要读全部候选并两两比对,那是一次抽取跑批的工作,
//     不是一次页面读取。这里只报**已裁决**的结果(`supersededById` 非空 = 这条输了),
//     因为那是一个已经落成事实的计数,不是一次现算的判断。
//   · 置信度分布不在这里。KD-210 说人确认之后置信不再参与排序,所以在一个以
//     「还有多少要人看」为主的位置上,它不是要回答的那个问题。
export interface LibraryKarda {
  /** 库里的断言总数(不含已删除)。 */
  assertions: number;
  /** 还没有人确认过的。这是「要人看的量」。 */
  unverified: number;
  /** 人确认过的。 */
  verified: number;
  /** 确认过但已到期,需要复看。 */
  stale: number;
  /** 已裁决冲突里输掉的那一方——保留而不是删除,是为了回答「我们曾经信过什么」。 */
  superseded: number;
  /** 抽出来的实体数。 */
  entities: number;
  /** 最近一条断言的落库时间。null = 这个库还没被抽取过,**不是 0 条**。 */
  lastExtractedAt: string | null;
}

export function emptyLibraryKarda(): LibraryKarda {
  return {
    assertions: 0,
    unverified: 0,
    verified: 0,
    stale: 0,
    superseded: 0,
    entities: 0,
    lastExtractedAt: null,
  };
}

/** `deleted` 的断言不该出现在任何一个计数里——它已经不是这个库的内容了。 */
const LIVE = { contentState: { not: "deleted" } };

/** `groupBy` 回来的一行:一个验证档位加它的条数。 */
export interface VerificationGroup {
  verificationState: string;
  _count: { _all: number };
}

/**
 * 纯聚合,和别的读模型同一条规矩(见 `processing/task-read.ts` 开头):**边界情形
 * 不需要一个数据库就能测**。查询负责取行,这里负责把行变成一句话。
 */
export function shapeLibraryKarda(
  byVerification: VerificationGroup[],
  superseded: number,
  entities: number,
  latest: Date | null,
): LibraryKarda {
  const count = (state: string): number =>
    byVerification.find((r) => r.verificationState === state)?._count._all ?? 0;
  return {
    // 总数从分组里**加出来**,而不是再发一次 count:两次查询之间可以插进一次写入,
    // 于是「总数」和「分档之和」会对不上——而一页上并排的两个数字对不上,读的人会
    // 认为这一页坏了,即使两个数字各自都是对的。加法还有第二个好处:出现一个这里
    // 没列举的档位时,它仍然计入总数,而不是凭空消失。
    assertions: byVerification.reduce((n, r) => n + r._count._all, 0),
    unverified: count("unverified"),
    verified: count("verified"),
    stale: count("stale"),
    superseded,
    entities,
    lastExtractedAt: latest?.toISOString() ?? null,
  };
}

export async function readLibraryKarda(kbId: string): Promise<LibraryKarda> {
  // 离线(无库)时返回全零而不是抛错:调用方是一页 UI,而「没有数据库」和
  // 「这个库还没被抽取过」在界面上本来就该长得一样——都是「还没有」。
  if (!prismaEnabled() || kbId === "") return emptyLibraryKarda();
  const p = await getPrismaClient();

  const [byVerification, superseded, entities, latest] = await Promise.all([
    p.assertion.groupBy({
      by: ["verificationState"],
      where: { kbId, ...LIVE },
      _count: { _all: true },
    }),
    p.assertion.count({ where: { kbId, ...LIVE, supersededById: { not: null } } }),
    p.entity.count({ where: { kbId } }),
    p.assertion.findFirst({
      where: { kbId, ...LIVE },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return shapeLibraryKarda(byVerification, superseded, entities, latest?.createdAt ?? null);
}

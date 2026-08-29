import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { recordConflictOutcome } from "./store";

// 知识确认台的读写层:属主在**一个库**上看到并处置卡尔达的抽取产出。
//
// 为什么它必须存在——抽取流此前在中途是**断**的:`storeExtraction` 把断言落为
// `draft`(「写入不等于进入检索」),`isRecallable` 只认 `indexed`,而全仓没有任何
// 生产路径做这个晋升。于是抽取跑得再多,agent 侧的 browse / get_evidence /
// find_entity 永远读到空。缺的不是规则,是**人确认**这个动作的落点(KD-222)。
//
// 与 agent 面(`browse-store.ts`)的分工,browse-read 的注释早写好了:「Console 是
// 属主带着会话与身份审草稿的地方」——那里过滤到 recallable-only 是对 agent 的纪律,
// 这里看得到草稿是属主的职权。两个面共用同一批行,纪律不同,所以是两个读模型。
//
// 确认 = **收录 + 验证,一个动作**(KD-222):人按下「确认收录」时说的是「这条知识
// 是对的,可以被检索」——把它拆成两个按钮,就会出现「已收录但没人确认」这个既进了
// 检索又没人负责的中间态,而那正是 KD-209 拦的东西。

export interface KnowledgeEvidence {
  /** 抽取时从当版原文切下的引文——不是事后重切的(见 `extract.ts`)。 */
  excerpt: string;
  documentId: string;
  documentTitle: string;
  /** 断言级溯源三问里的「哪一版」(140 §4)。 */
  documentVersion: number;
}

export interface KnowledgeAssertion {
  id: string;
  kind: string;
  subject: string | null;
  statement: string;
  /** 据谁所说——来源中的权威,**不是**抽取器(140 §4 唯一容易做错的地方)。 */
  assertedBy: string | null;
  asOf: string | null;
  validUntil: string | null;
  /** 机器置信。人确认前是队列的排序信号(KD-210),确认后只是抽取器的成绩单。 */
  confidence: number | null;
  contentState: string;
  verificationState: string;
  verifier: string | null;
  verifiedAt: string | null;
  supersededById: string | null;
  createdAt: string;
  /** 第一条支撑依据。null = 没有(理论上不该发生——无依据的断言会被 sweep 掉)。 */
  evidence: KnowledgeEvidence | null;
}

export interface KnowledgeEntity {
  id: string;
  name: string;
  kind: string;
  aliases: string[];
  /** 提及它的**在世**断言数(草稿也算——这是确认台,草稿正是要看的东西)。 */
  mentionCount: number;
}

/** 同一 subject 下互相矛盾的一组断言,等一次裁决。 */
export interface ConflictGroup {
  subject: string;
  items: KnowledgeAssertion[];
}

export interface LibraryKnowledge {
  /** 待确认队列:`draft` 且未被取代。 */
  drafts: KnowledgeAssertion[];
  /** 已收录:`indexed`,含已被取代的——「我们曾认为 X」本身是信息(§8.1 同一裁定)。 */
  admitted: KnowledgeAssertion[];
  entities: KnowledgeEntity[];
  conflicts: ConflictGroup[];
  /** 最近一次抽取落库的时间。null = 从没跑过,与「跑过但被清空」不同。 */
  extractedAt: string | null;
  /** 触到读取上限——列表是「最近 N 条」而不是全部,界面必须说出来。 */
  capped: boolean;
}

/** 一次读多少条断言。上限跟着「一页 UI 还能不能诚实呈现」走,不是跟着性能走:
 *  超过它就该说「仅显示最近 2000 条」,而不是装作展示了全部。 */
export const READ_CAP = 2_000;
const ENTITY_CAP = 500;

export function emptyLibraryKnowledge(): LibraryKnowledge {
  return { drafts: [], admitted: [], entities: [], conflicts: [], extractedAt: null, capped: false };
}

// --- 纯聚合(与别的读模型同一条规矩:边界情形不需要数据库就能测) ---------------------

/**
 * 同一 subject、不同 statement 的**在世**断言分组——裁决的候选。
 *
 * 与 `extract.ts` 的 `conflictCandidates` 不是一回事,也不能合并:那个在**一个抽取
 * 批次内**、落库之前跑,输入是 PreparedAssertion;这个跨批次、跨时间,对**已存储**的
 * 行跑——上月抽的和今天抽的互相矛盾,只有这里看得见。
 *
 * 按 subject 而不按相似度,理由沿用那边的:冲突是「同一件事的两个版本」,而「同一
 * 件事」由 subject 判定——相似度阈值会让裁决队列取决于某个嵌入模型的心情。
 */
export function groupConflicts(items: KnowledgeAssertion[]): ConflictGroup[] {
  const bySubject = new Map<string, KnowledgeAssertion[]>();
  for (const a of items) {
    if (!a.subject) continue; // 没有 subject,就没有「同一件事」可言
    if (a.supersededById) continue; // 已裁决的输家不再是候选——否则裁完还在队列里
    if (a.contentState === "deleted") continue;
    const key = a.subject.trim().toLowerCase();
    if (!key) continue;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(a);
  }

  const groups: ConflictGroup[] = [];
  for (const items of bySubject.values()) {
    // 至少两个**不同的** statement 才是冲突;同一句话抽了两遍是去重问题,不是裁决问题。
    const distinct = new Set(items.map((a) => a.statement));
    if (distinct.size < 2) continue;
    groups.push({
      subject: items[0].subject!,
      // 新的在前:裁决时人最先要看的是「最新的说法是什么」。
      items: [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    });
  }
  // 大组在前——三条互咬比两条互咬更需要人。
  return groups.sort((a, b) => b.items.length - a.items.length);
}

/**
 * 确认后的复验到期时间。
 *
 * 只有**开了治理且设了周期**的库才给断言上钟:治理关着时,库里的文档也不进复验
 * 跟踪,断言单独走一套钟就成了第二套治理。这与 KD-208 的口径一致——不为任何一类
 * 内容单开例外。
 */
export function confirmationExpiry(
  kb: { governanceEnabled: boolean; defaultVerifyIntervalDays: number | null },
  now: Date,
): Date | null {
  if (!kb.governanceEnabled || !kb.defaultVerifyIntervalDays) return null;
  return new Date(now.getTime() + kb.defaultVerifyIntervalDays * 86_400_000);
}

// --- 读 ---------------------------------------------------------------------------

type Row = {
  id: string;
  kind: string;
  subject: string | null;
  statement: string;
  assertedBy: string | null;
  asOf: Date | null;
  validUntil: Date | null;
  confidence: unknown;
  contentState: string;
  verificationState: string;
  verifier: string | null;
  verifiedAt: Date | null;
  supersededById: string | null;
  createdAt: Date;
  evidence: {
    span: { excerpt: string; documentId: string; documentVersion: number; document: { title: string } };
  }[];
};

function toItem(r: Row): KnowledgeAssertion {
  const ev = r.evidence[0]?.span;
  return {
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    statement: r.statement,
    assertedBy: r.assertedBy,
    asOf: r.asOf?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
    // Prisma Decimal 不能直接进 JSON payload——Number() 一次,精度损失对一个
    // 0-1 的三位小数不存在。
    confidence: r.confidence == null ? null : Number(r.confidence),
    contentState: r.contentState,
    verificationState: r.verificationState,
    verifier: r.verifier,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    supersededById: r.supersededById,
    createdAt: r.createdAt.toISOString(),
    evidence: ev
      ? {
          excerpt: ev.excerpt,
          documentId: ev.documentId,
          documentTitle: ev.document.title,
          documentVersion: ev.documentVersion,
        }
      : null,
  };
}

export async function readLibraryKnowledge(kbId: string): Promise<LibraryKnowledge> {
  if (!prismaEnabled() || kbId === "") return emptyLibraryKnowledge();
  const p = await getPrismaClient();

  const [rows, entities, latest] = await Promise.all([
    p.assertion.findMany({
      where: { kbId, contentState: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      take: READ_CAP,
      select: {
        id: true,
        kind: true,
        subject: true,
        statement: true,
        assertedBy: true,
        asOf: true,
        validUntil: true,
        confidence: true,
        contentState: true,
        verificationState: true,
        verifier: true,
        verifiedAt: true,
        supersededById: true,
        createdAt: true,
        evidence: {
          where: { stance: "supports", spanId: { not: null } },
          take: 1,
          select: {
            span: {
              select: {
                excerpt: true,
                documentId: true,
                documentVersion: true,
                document: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    p.entity.findMany({
      where: { kbId },
      orderBy: { createdAt: "desc" },
      take: ENTITY_CAP,
      select: {
        id: true,
        name: true,
        kind: true,
        aliases: true,
        // 在世断言的提及——草稿也算。agent 面只数 recallable(那是对外的纪律);
        // 确认台要回答的是「抽出来的东西都提到了谁」,把草稿排除掉,确认之前这一栏
        // 永远是空的,而那时恰恰是最需要它的时候。
        _count: {
          select: {
            mentions: {
              where: { assertion: { contentState: { notIn: ["deleted"] }, supersededById: null } },
            },
          },
        },
      },
    }),
    p.assertion.findFirst({ where: { kbId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const items = (rows as unknown as Row[]).map(toItem);

  const drafts = items
    .filter((a) => a.contentState === "draft" && a.supersededById === null)
    // 置信降序,无置信垫底:未确认的断言,置信是唯一可用的质量信号(KD-210)——
    // 把有把握的排在前面,人可以先把容易的批掉。
    .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));

  const admitted = items.filter((a) => a.contentState === "indexed");

  return {
    drafts,
    admitted,
    conflicts: groupConflicts(items),
    entities: (entities as { id: string; name: string; kind: string; aliases: unknown; _count: { mentions: number } }[])
      .map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        aliases: Array.isArray(e.aliases) ? (e.aliases as unknown[]).filter((x): x is string => typeof x === "string") : [],
        mentionCount: e._count.mentions,
      }))
      .filter((e) => e.mentionCount > 0)
      .sort((a, b) => b.mentionCount - a.mentionCount),
    extractedAt: latest?.createdAt.toISOString() ?? null,
    capped: rows.length >= READ_CAP,
  };
}

// --- 写 ---------------------------------------------------------------------------

/**
 * 确认收录:draft/indexed 且未被取代的断言 -> `indexed` + `verified`。
 *
 * where 子句就是权限与状态检查:不在这个库的、已删除的、已被取代的行**匹配不上**,
 * 而不是先查再改——两步之间的窗口里状态可以变。返回实际改动数,调用方按差额向人
 * 报告「有 N 条已不在可确认状态」,而不是笼统的成功。
 *
 * 已被取代的行拒绝确认是一条规则,不是巧合:确认一个裁决输家等于复活它,而裁决
 * 没有反向操作——复活只能通过把赢家也裁掉,那是另一次裁决。
 */
export async function confirmAssertions(
  kbId: string,
  ids: string[],
  verifier: string,
  expiresAt: Date | null,
): Promise<number> {
  if (ids.length === 0 || !prismaEnabled()) return 0;
  const p = await getPrismaClient();
  const now = new Date();
  const res = await p.assertion.updateMany({
    where: { id: { in: ids }, kbId, contentState: { in: ["draft", "indexed"] }, supersededById: null },
    data: {
      contentState: "indexed",
      verificationState: "verified",
      verifier,
      verifiedAt: now,
      expiresAt,
      updatedAt: now,
    },
  });
  return res.count;
}

/** 剔除:软删。行保留(审计窗口),但从此任何读面都不再返回它。 */
export async function discardAssertions(kbId: string, ids: string[]): Promise<number> {
  if (ids.length === 0 || !prismaEnabled()) return 0;
  const p = await getPrismaClient();
  const res = await p.assertion.updateMany({
    where: { id: { in: ids }, kbId, contentState: { not: "deleted" } },
    data: { contentState: "deleted", updatedAt: new Date() },
  });
  return res.count;
}

/**
 * 裁决:采信 winner,其余判负。
 *
 * 采信**蕴含确认**——说「这一条是对的、其它都让位」的人,不可能同时对这一条持
 * 保留态度。所以赢家走 `confirmAssertions`(收录 + 验证),输家逐条
 * `recordConflictOutcome`(取代 + contradicts 边,输家保留)。
 *
 * 不包成一个大事务是刻意的:每一对 (winner, loser) 的取代自身是事务(store.ts),
 * 而整批中断后**重跑无害**——已判负的行再判一遍落的是同一个值。一个横跨 N 对的
 * 大事务换来的原子性,买单的是锁的宽度,而这里没有需要原子性保护的不变量。
 */
export async function adjudicate(
  kbId: string,
  winnerId: string,
  loserIds: string[],
  verifier: string,
  expiresAt: Date | null,
): Promise<{ confirmed: number; superseded: number }> {
  if (!prismaEnabled()) return { confirmed: 0, superseded: 0 };
  const p = await getPrismaClient();
  // 输家先验归属:`recordConflictOutcome` 收裸 id,把边界检查留给调用方——这里就是
  // 那个调用方。不属于这个库的 id 直接整批拒绝,而不是跳过:一个混了外库 id 的请求
  // 不是部分正确的请求,是构造错误的请求。
  const owned = await p.assertion.findMany({
    where: { id: { in: [winnerId, ...loserIds] }, kbId },
    select: { id: true },
  });
  if (owned.length !== loserIds.length + 1) return { confirmed: 0, superseded: 0 };

  const confirmed = await confirmAssertions(kbId, [winnerId], verifier, expiresAt);
  if (confirmed === 0) return { confirmed: 0, superseded: 0 }; // 赢家已被取代/删除——裁决对象已经不存在

  let superseded = 0;
  for (const loserId of loserIds) {
    await recordConflictOutcome(winnerId, loserId);
    superseded += 1;
  }
  return { confirmed, superseded };
}

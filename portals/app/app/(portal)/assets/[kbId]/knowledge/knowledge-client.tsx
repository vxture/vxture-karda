"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ActionMenu,
  Banner,
  BulkActionBar,
  Button,
  Card,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FilterBar,
  Icon,
  Input,
  Pagination,
  SegmentedControl,
  TableTitleCell,
  useListPagination,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableSort,
} from "@vxture/design-system";
import {
  getKb,
  getLibraryKnowledge,
  confirmKnowledge,
  discardKnowledge,
  adjudicateKnowledge,
  loginHref,
  ApiError,
  type Kb,
  type LibraryKnowledge,
  type KnowledgeAssertion,
  type KnowledgeEntity,
  type ConflictGroup,
} from "../../../../_lib/api";
import { Badge as ToneBadge, SignInGate } from "../../../../_lib/ui";
import { PageHead } from "../../../../_shell/PageHead";
import { useFormat, type Failure } from "../../../../_i18n/useFormat";
import { useMessages } from "../../../../_i18n/useMessages";
import { common } from "../../../../_i18n/messages/common";
import type { Message } from "../../../../_i18n/catalog";
import { assets } from "../../../../_i18n/messages/assets";

// 知识确认台:卡尔达在**一个库**上的产出,由属主处置(KD-222)。
//
// 这一页是抽取流的**闭环点**。`storeExtraction` 把断言落为草稿(「写入不等于进入
// 检索」),`isRecallable` 只认已收录——而在这一页出现之前,全仓没有任何生产路径做
// 这个晋升:抽取跑得再多,agent 侧的 browse / get_evidence / find_entity 永远读到
// 空。缺的不是规则,是**人确认**这个动作的落点。
//
// 三条这里的约定:
//
//   · **冲突置顶**。互相矛盾的断言是这一页上唯一需要人**判断**(而不只是过目)的
//     东西,和文档清单钉失败是同一条规矩;
//   · **确认 = 收录 + 验证,一个动作**,且确认不弹确认框——它是这一页的主动作,
//     后果(进入检索)正是人想要的;剔除与采信才拦一道:前者无恢复入口,后者没有
//     反向操作;
//   · **草稿按置信降序**。未确认的断言,置信是唯一可用的质量信号(KD-210)——有
//     把握的排在前面,人可以先把容易的批掉。
//
// 不与 AssetClient 共用组件,与设置页共用的理由在这里不成立:设置页要的服务端数据
// 与详情页是同一批,这一页要的是另一批(knowledge 端点)——共用只会让两页各自多载
// 对方的数据。
type Scope = "drafts" | "admitted" | "entities";

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/** 断言类型词表的语言侧。认不出的值原样返回——与状态标签同一条规矩。 */
function kindLabel(kind: string, m: Record<"kKindFact" | "kKindClaim" | "kKindEvent" | "kKindProcedure" | "kKindRule", string>): string {
  const map: Record<string, string> = {
    fact: m.kKindFact,
    claim: m.kKindClaim,
    event: m.kKindEvent,
    procedure: m.kKindProcedure,
    rule: m.kKindRule,
  };
  return map[kind] ?? kind;
}

function pct(confidence: number | null): string {
  return confidence == null ? "—" : `${Math.round(confidence * 100)}%`;
}

function dots(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

export function KnowledgeClient() {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const params = useParams<{ kbId: string }>();
  const kbId = params.kbId;

  const [kb, setKb] = useState<Kb | null>(null);
  const [knowledge, setKnowledge] = useState<LibraryKnowledge | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scope, setScope] = useState<Scope>("drafts");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<DataTableSort>({ columnId: "confidence", direction: "desc" });
  const [expanded, setExpanded] = useState<string[]>([]);
  /** 正在裁决的组与被采信的那一条。null = 对话框关着。 */
  const [adopt, setAdopt] = useState<{ group: ConflictGroup; winner: KnowledgeAssertion } | null>(null);

  const guard = useCallback((e: unknown, fallback: Message): void => {
    if (e instanceof ApiError && e.status === 401) {
      setNeedsAuth(true);
      return;
    }
    setError({ cause: e, fb: fallback });
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [k, kn] = await Promise.all([getKb(kbId), getLibraryKnowledge(kbId)]);
      setKb(k);
      setKnowledge(kn);
    } catch (e) {
      guard(e, assets.errKnowledgeLoad);
    }
  }, [kbId, guard]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** 每个写动作都经这里:一个 busy 闸,一处清旧横幅,一处报失败,做完必刷新——
   *  这一页的每个动作都会改变三个清单里至少两个,不刷新就是在展示旧世界。 */
  const run = useCallback(
    async (fallback: Message, fn: () => Promise<string | null | void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const message = await fn();
        await loadAll();
        setSelected([]);
        if (typeof message === "string") setNotice(message);
      } catch (e) {
        guard(e, fallback);
      } finally {
        setBusy(false);
      }
    },
    [busy, guard, loadAll],
  );

  const doConfirm = (ids: string[]) =>
    run(assets.errKnowledgeAct, async () => {
      const r = await confirmKnowledge(kbId, ids);
      return r.confirmed === r.requested
        ? m.okKConfirm(r.confirmed)
        : m.okKConfirmPartial(r.confirmed, r.requested - r.confirmed);
    });

  const doDiscard = (ids: string[]) =>
    run(assets.errKnowledgeAct, async () => {
      const r = await discardKnowledge(kbId, ids);
      return m.okKDiscard(r.discarded);
    });

  const doAdopt = (group: ConflictGroup, winner: KnowledgeAssertion) =>
    run(assets.errKnowledgeAct, async () => {
      const loserIds = group.items.filter((a) => a.id !== winner.id).map((a) => a.id);
      try {
        const r = await adjudicateKnowledge(kbId, winner.id, loserIds);
        return m.okKAdopt(r.superseded);
      } catch (e) {
        // 409 = 裁决对象刚被别处处理过。这不是失败,是世界变了——刷新已经由 run
        // 兜着,这里只把「重新判断」说出来。
        if (e instanceof ApiError && e.status === 409) return m.errAdjStale;
        throw e;
      }
    });

  // --- 筛选与分页(全部客户端,KD-219 的理由原样适用:冲突分组、scope 计数都要
  // 读整份清单才算得出来) ---------------------------------------------------------

  const q = query.trim().toLowerCase();
  const drafts = (knowledge?.drafts ?? []).filter(
    (a) => q === "" || a.statement.toLowerCase().includes(q) || (a.subject ?? "").toLowerCase().includes(q),
  );
  const admitted = (knowledge?.admitted ?? []).filter(
    (a) => q === "" || a.statement.toLowerCase().includes(q) || (a.subject ?? "").toLowerCase().includes(q),
  );
  const entities = (knowledge?.entities ?? []).filter(
    (e) => q === "" || e.name.toLowerCase().includes(q) || e.aliases.some((al) => al.toLowerCase().includes(q)),
  );

  const sortedDrafts =
    sort.columnId === "confidence"
      ? [...drafts].sort((a, b) => (sort.direction === "asc" ? 1 : -1) * ((a.confidence ?? -1) - (b.confidence ?? -1)))
      : drafts;
  const sortedEntities =
    sort.columnId === "mentions"
      ? [...entities].sort((a, b) => (sort.direction === "asc" ? 1 : -1) * (a.mentionCount - b.mentionCount))
      : entities;

  const activeRows: (KnowledgeAssertion | KnowledgeEntity)[] =
    scope === "drafts" ? sortedDrafts : scope === "admitted" ? admitted : sortedEntities;
  const pager = useListPagination(activeRows, PAGE_SIZE);
  const { resetPage } = pager;
  useEffect(() => {
    resetPage();
    setSelected([]);
    setExpanded([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetPage 每次渲染都是新函数,挂进依赖会每帧重置
  }, [scope, query]);

  if (needsAuth) return <SignInGate href={loginHref(`/assets/${kbId}/knowledge`)} />;

  const neverRan = knowledge !== null && knowledge.extractedAt === null;

  // --- 断言行的公共件 --------------------------------------------------------------

  const statementCell = (a: KnowledgeAssertion) => (
    <TableTitleCell
      title={a.statement}
      description={dots(a.subject, a.assertedBy ? m.kAssertedBy(a.assertedBy) : null)}
      tooltip={a.statement}
    />
  );

  const detail = (a: KnowledgeAssertion) =>
    a.evidence ? (
      <div className="flex flex-col gap-2xs">
        {/* 引文是抽取时从**当版原文**切下的,不是事后重切——重建之后偏移可能失效,
            而一条给不出原文的引用不是引用(extract.ts 同一条注释)。 */}
        <blockquote className="border-l-2 border-border pl-sm text-body-sm text-muted-foreground">
          {a.evidence.excerpt}
        </blockquote>
        <span className="text-body-sm text-muted-foreground">
          {m.kSourceOf(a.evidence.documentTitle, a.evidence.documentVersion)}
          {a.verifiedAt
            ? ` · ${m.verifiedWhen(f.when(a.verifiedAt))}${a.verifier ? ` · ${m.verifiedBy(a.verifier)}` : ""}`
            : ""}
        </span>
      </div>
    ) : null;

  const draftActions = (a: KnowledgeAssertion): ActionMenuItem[] => [
    { id: "confirm", label: m.actConfirm, icon: "seal-check", disabled: busy, onSelect: () => void doConfirm([a.id]) },
    {
      id: "discard",
      label: m.actDiscard,
      icon: "trash",
      danger: true,
      separatorBefore: true,
      confirm: {
        verb: m.actDiscard,
        target: a.statement,
        consequence: m.kDiscardConsequence,
        onConfirm: () => Promise.resolve(doDiscard([a.id])),
      },
    },
  ];

  const admittedActions = (a: KnowledgeAssertion): ActionMenuItem[] => [
    // 已被取代的行没有「确认」:确认一个裁决输家等于复活它,而裁决没有反向操作。
    ...(a.supersededById === null && a.verificationState !== "verified"
      ? [{ id: "confirm", label: m.actConfirm, icon: "seal-check" as const, disabled: busy, onSelect: () => void doConfirm([a.id]) }]
      : []),
    {
      id: "discard",
      label: m.actDiscard,
      icon: "trash",
      danger: true,
      confirm: {
        verb: m.actDiscard,
        target: a.statement,
        consequence: m.kDiscardConsequence,
        onConfirm: () => Promise.resolve(doDiscard([a.id])),
      },
    },
  ];

  const draftColumns: DataTableColumn<KnowledgeAssertion>[] = [
    { id: "statement", header: m.kColAssertion, cell: statementCell },
    { id: "kind", header: m.kColKind, align: "center", width: "xs", cell: (a) => kindLabel(a.kind, m) },
    {
      id: "confidence",
      header: m.kColConfidence,
      align: "right",
      width: "xs",
      sortable: true,
      cell: (a) => <span className="tabular-nums">{pct(a.confidence)}</span>,
    },
    {
      id: "source",
      header: m.kColSource,
      width: "md",
      cell: (a) => <span className="truncate text-muted-foreground">{a.evidence?.documentTitle ?? "—"}</span>,
    },
  ];

  const admittedColumns: DataTableColumn<KnowledgeAssertion>[] = [
    { id: "statement", header: m.kColAssertion, cell: statementCell },
    {
      id: "verification",
      header: m.kColVerification,
      align: "center",
      width: "sm",
      cell: (a) => {
        const vr = f.verification(a.verificationState);
        return (
          <span className="flex flex-wrap items-center justify-center gap-xs">
            {a.supersededById && <ToneBadge tone="muted">{m.kSuperseded}</ToneBadge>}
            <ToneBadge tone={a.supersededById ? "muted" : vr.tone}>{vr.label}</ToneBadge>
          </span>
        );
      },
    },
    {
      id: "validity",
      header: m.kColValidity,
      width: "sm",
      cell: (a) => (
        <span className="tabular-nums text-muted-foreground">
          {dots(a.asOf ? m.kAsOf(f.when(a.asOf)) : null, a.validUntil ? m.kValidUntil(f.when(a.validUntil)) : null) || "—"}
        </span>
      ),
    },
    {
      id: "source",
      header: m.kColSource,
      width: "md",
      cell: (a) => <span className="truncate text-muted-foreground">{a.evidence?.documentTitle ?? "—"}</span>,
    },
  ];

  const entityColumns: DataTableColumn<KnowledgeEntity>[] = [
    {
      id: "name",
      header: m.kScopeEntities,
      cell: (e) => <TableTitleCell title={e.name} description={e.aliases.join(" · ") || undefined} />,
    },
    { id: "kind", header: m.kColKind, align: "center", width: "xs", cell: (e) => e.kind },
    {
      id: "mentions",
      header: m.kColMentions,
      align: "right",
      width: "xs",
      sortable: true,
      cell: (e) => <span className="tabular-nums">{f.number(e.mentionCount)}</span>,
    },
  ];

  const footer =
    activeRows.length > 0 ? (
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        total={activeRows.length}
        pageSize={pager.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={pager.onPageChange}
        onPageSizeChange={pager.onPageSizeChange}
        previousLabel={c.pagerPrev}
        nextLabel={c.pagerNext}
        pageSizeLabel={c.pagerSizeLabel}
        pageSizeOptionTemplate={c.pagerSizeTemplate}
        countLabel={c.pagerCount(activeRows.length)}
      />
    ) : undefined;

  const emptyFor: Record<Scope, { title: string; hint: string }> = {
    drafts: { title: m.kDraftsEmpty, hint: m.kDraftsEmptyHint },
    admitted: { title: m.kAdmittedEmpty, hint: m.kAdmittedEmptyHint },
    entities: { title: m.kEntitiesEmpty, hint: m.kEntitiesEmptyHint },
  };
  const empty =
    q !== "" ? (
      <EmptyState
        title={scope === "entities" ? m.kNoMatchEntities : m.kNoMatchAssertions}
        description={m.docNoMatchHint}
        action={<Button variant="outline" onClick={() => setQuery("")}>{m.docClearSearch}</Button>}
      />
    ) : (
      <EmptyState title={emptyFor[scope].title} description={emptyFor[scope].hint} />
    );

  return (
    <>
      <PageHead
        title={kb ? m.knowledgeTitle(kb.name) : c.loading}
        description={m.knowledgeDesc}
        meta={
          knowledge
            ? m.knowledgeMeta(knowledge.drafts.length, knowledge.admitted.length, knowledge.entities.length)
            : undefined
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/assets/${kbId}`}>{m.backToLibrary}</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}
      {knowledge?.capped && <p className="text-body-sm text-warning-text">{m.kCapped(2000)}</p>}

      {knowledge === null ? (
        <EmptyState title={c.loading} />
      ) : neverRan ? (
        // 从没跑过和跑过但被清空是两件事,只有前者整页让位——那时三个 scope 的空态
        // 会说三句对现状全都不对的话。
        <EmptyState icon="sparkles" title={m.lifeExtractNone} description={m.kNeverRanHint} />
      ) : (
        <div className="flex flex-col gap-md">
          {/* 冲突置顶:这一页上唯一需要人**判断**(而不只是过目)的东西——和文档
              清单钉失败同一条规矩。 */}
          {knowledge.conflicts.length > 0 && (
            <div className="flex flex-col gap-sm">
              <div className="flex items-center gap-sm">
                <Icon name="scales" className="text-warning-text" />
                <span className="text-title-sm">{m.kConflictsTitle(knowledge.conflicts.length)}</span>
                <span className="text-body-sm text-muted-foreground">{m.kConflictsHint}</span>
              </div>
              {knowledge.conflicts.map((group) => (
                <Card key={group.subject}>
                  <CardContent className="flex flex-col gap-sm py-md">
                    <span className="text-body-md font-medium">{group.subject}</span>
                    {group.items.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-md border-t border-border/60 pt-sm first:border-t-0 first:pt-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-body-md">{a.statement}</div>
                          <div className="text-body-sm text-muted-foreground">
                            {dots(
                              kindLabel(a.kind, m),
                              a.assertedBy ? m.kAssertedBy(a.assertedBy) : null,
                              a.asOf ? m.kAsOf(f.when(a.asOf)) : null,
                              a.confidence != null ? pct(a.confidence) : null,
                              a.evidence?.documentTitle,
                            )}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdopt({ group, winner: a })}>
                          <Icon name="scales" />
                          {m.actAdopt}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <FilterBar
            scope={
              <SegmentedControl
                items={[
                  { value: "drafts", label: m.kScopeDrafts, count: knowledge.drafts.length },
                  { value: "admitted", label: m.kScopeAdmitted, count: knowledge.admitted.length },
                  { value: "entities", label: m.kScopeEntities, count: knowledge.entities.length },
                ]}
                value={scope}
                onChange={(v) => setScope(v as Scope)}
                size="sm"
                ariaLabel={m.knowledgeLabel}
              />
            }
            search={
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scope === "entities" ? m.kSearchEntities : m.kSearchAssertions}
                aria-label={scope === "entities" ? m.kSearchEntities : m.kSearchAssertions}
                className="w-[16rem] max-w-full"
              />
            }
            onReset={q !== "" ? () => setQuery("") : undefined}
            resetLabel={m.docClearSearch}
          />

          {scope === "drafts" && (
            <>
              {/* 确认不弹确认框:它是这一页的主动作,后果正是人想要的。剔除拦一道。 */}
              <BulkActionBar
                count={selected.length}
                noun={m.kNoun}
                selectionTemplate={c.bulkSelectedTemplate}
                actions={[
                  {
                    id: "confirm",
                    label: m.actConfirm,
                    icon: "seal-check",
                    disabled: busy,
                    onSelect: () => void doConfirm(selected),
                  },
                  {
                    id: "discard",
                    label: m.actDiscard,
                    icon: "trash",
                    danger: true,
                    confirm: {
                      verb: m.actDiscard,
                      target: m.kDiscardBulkTarget(selected.length),
                      consequence: m.kDiscardConsequence,
                      onConfirm: () => Promise.resolve(doDiscard(selected)),
                    },
                  },
                ]}
              />
              <DataTable<KnowledgeAssertion>
                columns={draftColumns}
                rows={pager.pageRows as KnowledgeAssertion[]}
                rowKey={(a) => a.id}
                loading={false}
                empty={empty}
                sort={sort}
                onSortChange={setSort}
                selectedKeys={selected}
                onSelectionChange={(keys) => setSelected([...keys])}
                rowActions={(a) => <ActionMenu items={draftActions(a)} label={m.docColActions} />}
                labels={{ rowActions: m.docColActions, expand: c.expand }}
                expandedContent={detail}
                expandedKeys={expanded}
                onExpandedChange={(keys) => setExpanded([...keys])}
                footer={footer}
              />
            </>
          )}

          {scope === "admitted" && (
            <DataTable<KnowledgeAssertion>
              columns={admittedColumns}
              rows={pager.pageRows as KnowledgeAssertion[]}
              rowKey={(a) => a.id}
              loading={false}
              empty={empty}
              rowActions={(a) => <ActionMenu items={admittedActions(a)} label={m.docColActions} />}
              labels={{ rowActions: m.docColActions, expand: c.expand }}
              expandedContent={detail}
              expandedKeys={expanded}
              onExpandedChange={(keys) => setExpanded([...keys])}
              footer={footer}
            />
          )}

          {scope === "entities" && (
            <DataTable<KnowledgeEntity>
              columns={entityColumns}
              rows={pager.pageRows as KnowledgeEntity[]}
              rowKey={(e) => e.id}
              loading={false}
              empty={empty}
              sort={sort}
              onSortChange={setSort}
              footer={footer}
            />
          )}
        </div>
      )}

      {/* 采信对话框。不是红色的 DestructiveButton:采信不销毁任何东西(输家保留),
          但它**没有反向操作**,所以拦一道、把后果写全,按钮用中性主色。 */}
      <Dialog open={adopt !== null} onOpenChange={(open) => !open && setAdopt(null)}>
        <DialogContent className="max-w-[36rem]">
          <DialogHeader>
            <DialogTitle className="leading-[1]">{m.kAdoptDialogTitle}</DialogTitle>
            <DialogDescription>
              {adopt ? m.kAdoptConsequence(adopt.group.items.length - 1) : ""}
            </DialogDescription>
          </DialogHeader>
          {adopt && (
            <blockquote className="border-l-2 border-primary pl-sm text-body-md">
              {adopt.winner.statement}
            </blockquote>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdopt(null)}>
              {c.cancel}
            </Button>
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                if (!adopt) return;
                const chosen = adopt;
                setAdopt(null);
                void doAdopt(chosen.group, chosen.winner);
              }}
            >
              {m.kAdoptGo}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

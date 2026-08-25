"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  Input,
  NativeSelect,
  SegmentedControl,
  StatusBadge,
  Toggle,
} from "@vxture/design-system";
import {
  listKbs,
  searchKbs,
  askKbs,
  loginHref,
  ApiError,
  type Kb,
  type SearchResult,
  type AskResult,
} from "../../_lib/api";

import { SignInGate } from "../../_lib/ui";
import { PageHead } from "../../_shell/PageHead";
import { useFormat, type Failure } from "../../_i18n/useFormat";
import { bench } from "../../_i18n/messages/bench";

// 检验台 - where an agent developer answers "will karda give my agent good
// answers" by asking it, on the same retrieval chain the agent will use.
//
// THE DISCLOSURES ARE THE POINT, not the results. A hit list is easy; what a
// developer cannot get anywhere else is an honest account of what happened
// underneath:
//
//   · DEGRADED - rerank was unavailable, so the order is keyword/vector RRF.
//     The results are real but the ranking is not what production ranking is.
//   · PARTIAL  - a namespace failed. The answer is incomplete and does not say
//     which part is missing, which matters more than the count.
//   · IGNORED  - libraries the caller named that were dropped for visibility.
//     Silence here reads as "no hits there", which is a different and much more
//     comforting conclusion than "you cannot see it".
//
// Batch 13 also gave the page the QUALITY TIER control. Without it the bench
// could only ever show the default tier, so the one question it exists to answer
// - what will my agent get when it asks for verified content - was unanswerable
// on the very surface built to answer it.

type Mode = "search" | "ask";

const FILTERS = [
  { value: "verified_only", label: "仅已验证", hint: "只召回经人工验证且未过期的内容——最严，也最少" },
  { value: "verified_and_untracked", label: "已验证 + 未纳管", hint: "默认档：已验证的，加上所在库未开治理的内容" },
  { value: "all", label: "全部", hint: "包括过期与未验证内容——用于排查「为什么查不到」" },
] as const;

export function BenchClient() {
  const f = useFormat();
  const [kbs, setKbs] = useState<Kb[] | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("verified_and_untracked");
  const [topK, setTopK] = useState("10");
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [ask, setAsk] = useState<AskResult | null>(null);
  const [askUnavailable, setAskUnavailable] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setKbs(await listKbs());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      setError({ cause: e, fb: bench.errLoadKbs });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kbName = (id: string) => kbs?.find((k) => k.id === id)?.name ?? id;

  function toggleKb(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || running) return;
    setRunning(true);
    setError(null);
    setSearch(null);
    setAsk(null);
    setAskUnavailable(false);
    setExpanded(new Set());

    const kb_ids = selected.size > 0 ? [...selected] : undefined;
    const top_k = Number(topK) > 0 ? Number(topK) : undefined;
    try {
      if (mode === "search") {
        setSearch(await searchKbs({ query: q, kb_ids, top_k, verification_filter: filter }));
      } else {
        setAsk(await askKbs({ question: q, kb_ids, top_k, verification_filter: filter }));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return setNeedsAuth(true);
      if (err instanceof ApiError && err.status === 501) setAskUnavailable(true);
      else setError({ cause: err, fb: bench.errQuery });
    } finally {
      setRunning(false);
    }
  }

  if (needsAuth) return <SignInGate href={loginHref("/bench")} />;

  const chosenFilter = FILTERS.find((f) => f.value === filter);
  const result = search ?? ask;

  return (
    <>
      <PageHead
        title="检验台"
        description="以 Agent 同款检索链路试问，验收供给质量"
        meta={kbs ? `可见 ${kbs.length} 个资产${selected.size > 0 ? ` · 已选 ${selected.size}` : ""}` : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tools">工具面</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}

      <Card>
        <CardContent className="py-md">
          <form onSubmit={onRun} className="flex flex-col gap-md">
            <div className="flex flex-wrap items-center gap-sm">
              <SegmentedControl
                items={[
                  { value: "search", label: "检索" },
                  { value: "ask", label: "问答" },
                ]}
                value={mode}
                onChange={(v) => setMode(v as Mode)}
                size="sm"
                ariaLabel="模式"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "search" ? "检索词" : "提问"}
                aria-label={mode === "search" ? "检索词" : "问题"}
                className="min-w-[18rem] flex-1"
                disabled={running}
              />
              <Button type="submit" variant="default" disabled={!query.trim() || running}>
                {running ? "执行中…" : mode === "search" ? "执行检索" : "生成回答"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-sm">
              <label className="flex items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">质量档</span>
                <NativeSelect
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="质量档"
                  wrapperClassName="w-[14rem]"
                  disabled={running}
                >
                  {FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">返回条数</span>
                <Input
                  value={topK}
                  onChange={(e) => setTopK(e.target.value)}
                  inputMode="numeric"
                  aria-label="返回条数"
                  className="w-[5rem]"
                  disabled={running}
                />
              </label>
              {chosenFilter && <span className="text-body-sm text-muted-foreground">{chosenFilter.hint}</span>}
            </div>

            {kbs && kbs.length > 0 && (
              <div className="flex flex-wrap items-center gap-xs">
                <span className="text-body-sm text-muted-foreground">
                  范围{selected.size === 0 && "：可见的全部资产"}
                </span>
                {kbs.map((kb) => (
                  <Toggle
                    key={kb.id}
                    size="sm"
                    pressed={selected.has(kb.id)}
                    onPressedChange={() => toggleKb(kb.id)}
                    disabled={running}
                  >
                    {kb.name}
                  </Toggle>
                ))}
                {selected.size > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    清空
                  </Button>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {askUnavailable && (
        <Banner tone="info" title="问答尚未接通：本机没有配置 Atlas 生成后端（A4）。检索仍可用。" />
      )}

      {/* The disclosures. Above the results, because a developer who reads the
          hits first has already formed a judgement by the time they learn the
          ranking was degraded. */}
      {result && <Disclosures result={result} kbName={kbName} />}

      {search &&
        (search.items.length === 0 ? (
          <EmptyState
            title="没有命中"
            description={
              filter === "verified_only"
                ? "当前是「仅已验证」档——放宽到「全部」再试一次，可以区分「没有内容」和「内容没验证」。"
                : "内容需要先完成加工与索引才可被检索。"
            }
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col py-sm">
              {search.items.map((item, i) => (
                <ResultRow
                  key={item.id}
                  rank={i + 1}
                  id={item.id}
                  kbId={item.kbId}
                  kbName={kbName(item.kbId)}
                  score={item.score}
                  snippet={item.snippet}
                  expanded={expanded.has(item.id)}
                  onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                />
              ))}
            </CardContent>
          </Card>
        ))}

      {ask &&
        (ask.noContext ? (
          <EmptyState
            title="没有找到可作依据的内容——因此没有生成回答"
            description="karda 不会在没有依据时编答案。放宽质量档或扩大范围再试。"
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-sm py-md">
                <span className="text-label-lg text-muted-foreground">回答</span>
                <p className="whitespace-pre-wrap text-body-md">{ask.answer}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col py-sm">
                <span className="px-sm py-xs text-label-lg text-muted-foreground">
                  引用 ({ask.citations.length})
                </span>
                {ask.citations.map((c, i) => (
                  <ResultRow
                    key={c.id}
                    rank={i + 1}
                    id={c.id}
                    kbId={c.kbId}
                    kbName={kbName(c.kbId)}
                    snippet={c.snippet}
                    expanded={expanded.has(c.id)}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                ))}
              </CardContent>
            </Card>
          </>
        ))}
    </>
  );
}

/** What happened underneath the results. Rendered even when everything was
 *  clean, because "nothing degraded" is itself the answer a developer came for -
 *  a page that only speaks up on failure leaves them unable to tell a healthy
 *  run from an unreported one. */
function Disclosures({
  result,
  kbName,
}: {
  result: SearchResult | AskResult;
  kbName: (id: string) => string;
}) {
  const ignored = "ignoredKbIds" in result ? result.ignoredKbIds : [];
  const scope = "scopeKbIds" in result ? result.scopeKbIds : [];
  const clean = !result.degraded && !result.partial && ignored.length === 0;

  return (
    <Card className={clean ? undefined : "border-warning/30"}>
      <CardContent className="flex flex-col gap-xs py-md">
        <div className="flex flex-wrap items-center gap-sm">
          <StatusBadge tone={clean ? "success" : "warning"} dot={false}>
            {clean ? "链路完整" : "有降级"}
          </StatusBadge>
          {scope.length > 0 && (
            <span className="text-body-sm text-muted-foreground">实际检索了 {scope.length} 个资产</span>
          )}
        </div>

        {result.degraded === "rerank_unavailable" && (
          <p className="text-body-sm text-warning-text">
            <Icon name="warning" className="mr-2xs inline align-middle" />
            重排不可用，当前顺序来自关键词/向量融合（RRF）。结果是真的，但排序不是生产排序——不要据此判断排序质量。
          </p>
        )}
        {result.partial && (
          <p className="text-body-sm text-warning-text">
            <Icon name="warning" className="mr-2xs inline align-middle" />
            部分命名空间查询失败，本次结果不完整。缺的是哪一部分无法得知——这比少了几条更值得注意。
          </p>
        )}
        {ignored.length > 0 && (
          <p className="text-body-sm text-destructive-text">
            {/* Silence here would read as "no hits there", which is a very
                different and much more comforting conclusion. */}
            指定的 {ignored.length} 个资产不在可见范围内，已被忽略：
            {ignored.map((id) => kbName(id)).join("、")}。它们不是「没有命中」，是「你看不到」。
          </p>
        )}
        {clean && (
          <p className="text-body-sm text-muted-foreground">
            重排可用、无命名空间失败、无被忽略的资产。这一次的结果可以按生产表现来读。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ResultRow({
  rank,
  id,
  kbId,
  kbName,
  score,
  snippet,
  expanded,
  onToggle,
}: {
  rank: number;
  id: string;
  kbId: string;
  kbName: string;
  score?: number;
  snippet: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2xs border-t border-border/60 py-sm first:border-t-0">
      <div className="flex items-center gap-sm">
        <span className="w-[1.5rem] shrink-0 text-right font-mono text-code-sm text-muted-foreground">{rank}</span>
        <Link href={`/assets/${kbId}`} className="truncate text-body-md font-medium underline-offset-2 hover:underline">
          {kbName}
        </Link>
        {score !== undefined && (
          <StatusBadge tone="info" dot={false}>
            {score.toFixed(4)}
          </StatusBadge>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onToggle}>
          {expanded ? "收起" : "展开"}
        </Button>
      </div>
      <p
        className={`whitespace-pre-wrap pl-[2.25rem] text-body-sm text-muted-foreground ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {snippet}
      </p>
      {expanded && (
        // The chunk id is what a developer needs to correlate a bench result
        // with what their agent received over the tool face.
        <span className="pl-[2.25rem] font-mono text-code-sm text-muted-foreground">chunk {id}</span>
      )}
    </div>
  );
}

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
import { useMessages } from "../../_i18n/useMessages";
import { channels as channelMessages } from "../../_i18n/messages/channels";
import { common } from "../../_i18n/messages/common";
import { shell } from "../../_i18n/messages/shell";

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
  // Structure only: WHICH tiers exist and in what order. Their names and hints
  // come from the catalog - see `channels.ts`.
  { value: "verified_only", labelKey: "tierVerifiedOnly", hintKey: "tierVerifiedOnlyHint" },
  { value: "verified_and_untracked", labelKey: "tierDefault", hintKey: "tierDefaultHint" },
  { value: "all", labelKey: "tierAll", hintKey: "tierAllHint" },
] as const;

export function BenchClient() {
  const f = useFormat();
  const m = useMessages(channelMessages);
  const sh = useMessages(shell);
  const c = useMessages(common);
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
      setError({ cause: e, fb: channelMessages.errLoadKbs });
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
      else setError({ cause: err, fb: channelMessages.errQuery });
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
        title={sh.subBench}
        description={sh.benchDesc}
        meta={kbs ? m.benchMeta(kbs.length, selected.size) : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tools">{sh.subTools}</Link>
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
                  { value: "search", label: m.modeSearch },
                  { value: "ask", label: m.modeAsk },
                ]}
                value={mode}
                onChange={(v) => setMode(v as Mode)}
                size="sm"
                ariaLabel={m.modeAria}
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "search" ? m.queryPlaceholderSearch : m.queryPlaceholderAsk}
                aria-label={mode === "search" ? m.queryPlaceholderSearch : m.queryAriaAsk}
                className="min-w-[18rem] flex-1"
                disabled={running}
              />
              <Button type="submit" variant="default" disabled={!query.trim() || running}>
                {running ? c.running : mode === "search" ? m.runSearch : m.runAsk}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-sm">
              <label className="flex items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">{m.tierLabel}</span>
                <NativeSelect
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label={m.tierLabel}
                  wrapperClassName="w-[14rem]"
                  disabled={running}
                >
                  {FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {m[f.labelKey]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">{m.topK}</span>
                <Input
                  value={topK}
                  onChange={(e) => setTopK(e.target.value)}
                  inputMode="numeric"
                  aria-label={m.topK}
                  className="w-[5rem]"
                  disabled={running}
                />
              </label>
              {chosenFilter && <span className="text-body-sm text-muted-foreground">{m[chosenFilter.hintKey]}</span>}
            </div>

            {kbs && kbs.length > 0 && (
              <div className="flex flex-wrap items-center gap-xs">
                <span className="text-body-sm text-muted-foreground">
                  {m.scopeLabel}{selected.size === 0 && m.scopeAll}
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
                    {m.scopeClear}
                  </Button>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {askUnavailable && (
        <Banner tone="info" title={m.askUnavailable} />
      )}

      {/* The disclosures. Above the results, because a developer who reads the
          hits first has already formed a judgement by the time they learn the
          ranking was degraded. */}
      {result && <Disclosures result={result} kbName={kbName} />}

      {search &&
        (search.items.length === 0 ? (
          <EmptyState
            title={m.noHits}
            description={
              filter === "verified_only"
                ? m.noHitsStrict
                : m.noHitsGeneric
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
            title={m.noGrounds}
            description={m.noGroundsDesc}
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-sm py-md">
                <span className="text-label-lg text-muted-foreground">{m.answerLabel}</span>
                <p className="whitespace-pre-wrap text-body-md">{ask.answer}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col py-sm">
                <span className="px-sm py-xs text-label-lg text-muted-foreground">
                  {m.citationsLabel(ask.citations.length)}
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
  const m = useMessages(channelMessages);
  const ignored = "ignoredKbIds" in result ? result.ignoredKbIds : [];
  const scope = "scopeKbIds" in result ? result.scopeKbIds : [];
  const clean = !result.degraded && !result.partial && ignored.length === 0;

  return (
    <Card className={clean ? undefined : "border-warning/30"}>
      <CardContent className="flex flex-col gap-xs py-md">
        <div className="flex flex-wrap items-center gap-sm">
          <StatusBadge tone={clean ? "success" : "warning"} dot={false}>
            {clean ? m.chainClean : m.chainDegraded}
          </StatusBadge>
          {scope.length > 0 && (
            <span className="text-body-sm text-muted-foreground">{m.scopeSearched(scope.length)}</span>
          )}
        </div>

        {result.degraded === "rerank_unavailable" && (
          <p className="text-body-sm text-warning-text">
            <Icon name="warning" className="mr-2xs inline align-middle" />
            {m.degradedRerank}
          </p>
        )}
        {result.partial && (
          <p className="text-body-sm text-warning-text">
            <Icon name="warning" className="mr-2xs inline align-middle" />
            {m.degradedPartial}
          </p>
        )}
        {ignored.length > 0 && (
          <p className="text-body-sm text-destructive-text">
            {/* Silence here would read as "no hits there", which is a very
                different and much more comforting conclusion. */}
            {m.ignoredLead(ignored.length)}
            {ignored.map((id) => kbName(id)).join(m.ignoredJoin)}
            {m.ignoredTail}
          </p>
        )}
        {clean && (
          <p className="text-body-sm text-muted-foreground">
            {m.chainCleanNote}
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
  const m = useMessages(channelMessages);
  const c = useMessages(common);
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
          {expanded ? c.collapse : c.expand}
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

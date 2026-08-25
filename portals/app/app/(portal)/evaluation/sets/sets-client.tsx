"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Icon,
  Input,
  NativeSelect,
  StatusBadge,
  Textarea,
} from "@vxture/design-system";
import {
  listEvalSets,
  createEvalSet,
  listEvalQuestions,
  addEvalQuestion,
  deleteEvalQuestion,
  runEvalSet,
  listEvalRuns,
  readRunDetail,
  listKbs,
  listDocuments,
  loginHref,
  ApiError,
  type EvalSetRow,
  type EvalQuestionRow,
  type RunWithDelta,
  type RunReport,
  type GapRow,
  type Kb,
  type Doc,
} from "../../../_lib/api";

import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { useFormat, type Failure } from "../../../_i18n/useFormat";
import { evaluation } from "../../../_i18n/messages/evaluation";
import { useMessages } from "../../../_i18n/useMessages";
import { shell } from "../../../_i18n/messages/shell";
import { common } from "../../../_i18n/messages/common";
import type { Message } from "../../../_i18n/catalog";

// 评测集 - authoring and running the question sets that make quality checkable.
//
// KD-011 ruled out synthetic QA generation for v1, so every question here is
// written by a person. That is a real cost and it is the point: a set generated
// from the corpus measures whether retrieval can find what it just indexed,
// which is a tautology rather than a baseline.
//
// TWO RULES THIS PAGE EXISTS TO HOLD:
//
//   1. EXPECTED EVIDENCE IS PICKED, NOT TYPED. It is document ids, and a typo
//      in a hand-entered id produces a question that can never be satisfied -
//      an eternal gap that looks like a retrieval failure. So the author picks
//      from the actual documents in scope.
//   2. "NOT MEASURED" NEVER RENDERS AS A NUMBER. When answering is unavailable
//      the two citation metrics come back null, and a 0% there would read as a
//      quality collapse when the truth is an infrastructure gap.

/** Metric key -> its catalog entry. The metric names are vocabulary; the
 *  figures beside them are per-run. */
type EvalPlainKey = {
  [K in keyof typeof evaluation]: (typeof evaluation)[K] extends { "zh-CN": string } ? K : never;
}[keyof typeof evaluation];

const METRIC_LABEL: Record<string, EvalPlainKey> = {
  recallHitPct: "metricRecall",
  citationPrecisionPct: "metricCitation",
  groundedAnswerPct: "metricGrounded",
};

const DIRECTION_TONE: Record<string, string> = {
  better: "text-success-text",
  worse: "text-destructive-text",
  flat: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

export function EvalSetsClient() {
  const f = useFormat();
  const m = useMessages(evaluation);
  const sh = useMessages(shell);
  const c = useMessages(common);
  const [sets, setSets] = useState<EvalSetRow[] | null>(null);
  const [live, setLive] = useState(true);
  const [kbs, setKbs] = useState<Kb[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [questions, setQuestions] = useState<EvalQuestionRow[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [runs, setRuns] = useState<RunWithDelta[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [gaps, setGaps] = useState<GapRow[] | null>(null);

  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<string>("");
  const [qText, setQText] = useState("");
  const [qEvidence, setQEvidence] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState("");

  const guard = useCallback((e: unknown, fallback: Message) => {
    if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
    setError({ cause: e, fb: fallback });
  }, []);

  const loadSets = useCallback(async () => {
    try {
      const r = await listEvalSets();
      setSets(r.sets);
      setLive(r.live);
    } catch (e) {
      guard(e, evaluation.errSets);
    }
  }, [guard]);

  useEffect(() => {
    void loadSets();
    listKbs().then(setKbs, () => {});
  }, [loadSets]);

  const openSet = useCallback(
    async (set: EvalSetRow) => {
      setActive(set.id);
      setReport(null);
      setGaps(null);
      try {
        setQuestions(await listEvalQuestions(set.id));
        setRuns((await listEvalRuns(set.id)).runs);
        // Evidence is PICKED from the documents actually in scope - a typed id
        // with a typo becomes a question that can never be satisfied.
        const scope = set.kbScope.length > 0 ? set.kbScope : kbs.map((k) => k.id);
        const all = await Promise.all(scope.map((id) => listDocuments(id).catch(() => [])));
        setDocs(all.flat());
      } catch (e) {
        guard(e, evaluation.errSetDetail);
      }
    },
    [guard, kbs],
  );

  async function run<T>(fallback: Message, fn: () => Promise<T | string | void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (typeof msg === "string") setNotice(msg);
    } catch (e) {
      guard(e, fallback);
    } finally {
      setBusy(false);
    }
  }

  if (needsAuth) return <SignInGate href={loginHref("/evaluation/sets")} />;

  const activeSet = sets?.find((s) => s.id === active) ?? null;

  return (
    <>
      <PageHead
        title={sh.subSets}
        description={m.setsDesc}
        meta={sets ? m.setsMeta(sets.length) : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/evaluation">{m.backToEvaluation}</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}
      {!live && (
        <Banner
          tone="info"
          title={m.setsNoDatabase}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{m.newSetTitle}</CardTitle>
          <CardDescription>
            {m.newSetBlurb}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-sm">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={m.setNamePlaceholder}
            aria-label={m.setNamePlaceholder}
            className="w-[20rem] max-w-full"
            disabled={busy || !live}
          />
          <NativeSelect
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            aria-label={m.scopeAria}
            wrapperClassName="w-[16rem]"
            disabled={busy || !live}
          >
            <option value="">{m.scopeAllAssets}</option>
            {kbs.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="default"
            disabled={busy || !live || !newName.trim()}
            onClick={() =>
              run(evaluation.errCreateSet, async () => {
                await createEvalSet(newName.trim(), newScope ? [newScope] : []);
                setNewName("");
                await loadSets();
                return m.okCreateSet;
              })
            }
          >
            <Icon name="plus" />
            {m.create}
          </Button>
        </CardContent>
      </Card>

      {sets === null ? (
        <EmptyState title={c.loading} />
      ) : sets.length === 0 ? (
        <EmptyState title={m.setsEmpty} description={m.setsEmptyHint} />
      ) : (
        <Card>
          <CardContent className="flex flex-col py-sm">
            {sets.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void openSet(s)}
                className={`flex items-center gap-md border-t border-border/60 py-sm text-left first:border-t-0 ${
                  active === s.id ? "text-primary" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-body-md font-medium">{s.name}</span>
                <span className="shrink-0 font-mono text-code-sm text-muted-foreground">{m.questionCount(s.questionCount)}</span>
                <span className="shrink-0 text-body-sm text-muted-foreground">
                  {s.kbScope.length === 0 ? m.scopeAllShort : m.scopeCount(s.kbScope.length)}
                </span>
                <Icon name="chevron-right" className="shrink-0 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {activeSet && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{m.questionsTitle(activeSet.name)}</CardTitle>
              <CardDescription>
                {m.evidenceBlurb1}
                <strong>{m.evidenceBlurb2}</strong>
                {m.evidenceBlurb3}
                <strong>{m.kindDocument}</strong>
                {m.evidenceBlurb5}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-sm">
              {questions.map((q) => (
                <div key={q.id} className="flex items-start gap-md border-t border-border/60 py-sm first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-body-md">{q.question}</div>
                    <div className="mt-2xs text-body-sm text-muted-foreground">
                      {q.expectedEvidence.length === 0 ? (
                        <span className="text-warning-text">{m.noEvidenceWarning}</span>
                      ) : (
                        m.evidenceCount(q.expectedEvidence.length)
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(common.deleteFailed, async () => {
                        await deleteEvalQuestion(activeSet.id, q.id);
                        setQuestions(await listEvalQuestions(activeSet.id));
                      })
                    }
                  >
                    {c.delete}
                  </Button>
                </div>
              ))}

              <div className="flex flex-col gap-sm border-t border-border/60 pt-sm">
                <Textarea
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder={m.newQuestionPlaceholder}
                  aria-label={m.newQuestionAria}
                  rows={2}
                  disabled={busy}
                />
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="text-body-sm text-muted-foreground">{m.expectedEvidenceLabel}</span>
                  {docs.length === 0 ? (
                    <span className="text-body-sm text-muted-foreground">{m.noDocsInScope}</span>
                  ) : (
                    docs.slice(0, 40).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          setQEvidence((prev) => {
                            const next = new Set(prev);
                            if (next.has(d.id)) next.delete(d.id);
                            else next.add(d.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-xs py-3xs text-body-sm ${
                          qEvidence.has(d.id) ? "border-primary bg-primary/10 text-primary" : "border-border"
                        }`}
                      >
                        {d.title}
                      </button>
                    ))
                  )}
                </div>
                <div>
                  <Button
                    disabled={busy || !qText.trim()}
                    onClick={() =>
                      run(evaluation.errAdd, async () => {
                        await addEvalQuestion(activeSet.id, qText.trim(), [...qEvidence]);
                        setQText("");
                        setQEvidence(new Set());
                        setQuestions(await listEvalQuestions(activeSet.id));
                        await loadSets();
                      })
                    }
                  >
                    <Icon name="plus" />
                    {m.addQuestion}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.runTitle}</CardTitle>
              <CardDescription>
                {m.runBlurb1}
                <strong>{m.runBlurb2}</strong>
                {m.runBlurb3}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-sm">
              <Input
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                placeholder={m.baselinePlaceholder}
                aria-label={m.baselineAria}
                className="w-[22rem] max-w-full"
                disabled={busy}
              />
              <Button
                variant="default"
                disabled={busy || questions.length === 0}
                onClick={() =>
                  run(evaluation.errRun, async () => {
                    const r = await runEvalSet(activeSet.id, { baseline_label: baseline.trim() || "unlabelled" });
                    setReport(r);
                    setRuns((await listEvalRuns(activeSet.id)).runs);
                    return r.regression
                      ? m.okRunRegression
                      : m.okRun;
                  })
                }
              >
                {busy ? m.running : m.runIt}
              </Button>
              {questions.length === 0 && (
                <span className="text-body-sm text-muted-foreground">{m.addQuestionsFirst}</span>
              )}
            </CardContent>
          </Card>

          {report && <RunReportCard report={report} />}

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{m.historyTitle}</CardTitle>
                <CardDescription>{m.historyBlurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col py-sm">
                {runs.map((r) => (
                  <div key={r.run.id} className="flex flex-wrap items-center gap-sm border-t border-border/60 py-sm first:border-t-0">
                    <span className="w-[10rem] shrink-0 truncate font-mono text-code-sm">{r.run.baselineLabel}</span>
                    <span className="shrink-0 text-body-sm text-muted-foreground">{f.when(r.run.startedAt)}</span>
                    {r.run.degraded && (
                      <StatusBadge tone="warning" dot={false}>
                        {m.chainDegraded}
                      </StatusBadge>
                    )}
                    {r.regression && (
                      <StatusBadge tone="danger" dot={false}>
                        {m.regression}
                      </StatusBadge>
                    )}
                    <span className="ml-auto flex flex-wrap gap-md">
                      {r.deltas.map((d) => (
                        <span key={d.key} className="text-body-sm text-muted-foreground">
                          {m[METRIC_LABEL[d.key]]}
                          <span className="ml-2xs font-mono text-foreground">
                            {d.current === null ? "—" : `${d.current.toFixed(1)}%`}
                          </span>
                          <span className={`ml-2xs font-mono ${DIRECTION_TONE[d.direction]}`}>
                            {d.delta === null ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)}`}
                          </span>
                        </span>
                      ))}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(evaluation.errDetail, async () => {
                          setGaps((await readRunDetail(r.run.id)).detail?.results ?? []);
                        })
                      }
                    >
                      {m.perQuestion}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {gaps && <GapsCard gaps={gaps} />}
        </>
      )}
    </>
  );
}

function RunReportCard({ report }: { report: RunReport }) {
  const m = useMessages(evaluation);
  return (
    <Card className={report.regression ? "border-t-medium border-t-destructive-border" : undefined}>
      <CardHeader>
        <CardTitle>{m.thisRun}</CardTitle>
        <CardDescription>
          {m.questionCount(report.run.questionCount)}
          {report.skipped > 0 && m.runSkipped(report.skipped)}
          {report.previous ? m.runComparedTo(report.previous.baselineLabel) : m.runNoPrevious}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        {!report.answeringAvailable && (
          // The distinction the whole design rests on. A 0% here would read as a
          // quality collapse when the truth is that generation is switched off.
          <Banner
            tone="info"
            title={m.noAnsweringBackend}
          />
        )}
        {report.run.degraded && (
          <Banner tone="warning" title={m.degradedRunWarning} />
        )}
        <div className="flex flex-wrap gap-lg">
          {report.deltas.map((d) => (
            <div key={d.key} className="flex flex-col">
              <span className="text-body-sm text-muted-foreground">{m[METRIC_LABEL[d.key]]}</span>
              <span className="font-mono text-title-lg leading-[1]">
                {d.current === null ? "—" : `${d.current.toFixed(1)}%`}
              </span>
              <span className={`font-mono text-code-sm ${DIRECTION_TONE[d.direction]}`}>
                {d.direction === "unknown"
                  ? m.notComparable
                  : d.delta === null
                    ? "—"
                    : `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)} pp`}
              </span>
            </div>
          ))}
          <div className="flex flex-col">
            <span className="text-body-sm text-muted-foreground">{m.gapsLabel}</span>
            <span className="font-mono text-title-lg leading-[1] text-warning-text">{report.run.gapCount}</span>
            <span className="text-body-sm text-muted-foreground">{m.gapsHint}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GapsCard({ gaps }: { gaps: GapRow[] }) {
  const m = useMessages(evaluation);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.perQuestionTitle}</CardTitle>
        <CardDescription>{m.perQuestionBlurb}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col py-sm">
        {gaps.map((g) => (
          <div key={g.questionId} className="flex flex-col gap-2xs border-t border-border/60 py-sm first:border-t-0">
            <div className="flex items-center gap-sm">
              <StatusBadge tone={g.recallHit ? "success" : "danger"} dot={false}>
                {g.recallHit ? m.recalled : m.gapBadge}
              </StatusBadge>
              {!g.grounded && (
                <StatusBadge tone="warning" dot={false}>
                  {m.noCitations}
                </StatusBadge>
              )}
              <span className="min-w-0 flex-1 truncate text-body-md">{g.question}</span>
              <span className="shrink-0 font-mono text-code-sm text-muted-foreground">
                {m.citationHits(g.citedExpected, g.citedTotal)}
              </span>
            </div>
            {g.answerExcerpt && (
              <p className="line-clamp-2 pl-md text-body-sm text-muted-foreground">{g.answerExcerpt}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

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

const METRIC_LABEL: Record<string, string> = {
  recallHitPct: "召回命中率",
  citationPrecisionPct: "引用准确率",
  groundedAnswerPct: "有据回答率",
};

const DIRECTION_TONE: Record<string, string> = {
  better: "text-success-text",
  worse: "text-destructive-text",
  flat: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

export function EvalSetsClient() {
  const f = useFormat();
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
        title="评测集"
        description="人工编写的问题集——运行一次，就有了可比较的质量基线"
        meta={sets ? `${sets.length} 个集合` : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/evaluation">返回验证评测</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}
      {!live && (
        <Banner
          tone="info"
          title="当前未连接数据库，评测集不可用。这里不提供演示集——运行结果不落库的评测无法回答「这次改动是变好还是变坏」，带按钮的演示评测会是产品里最误导人的界面。"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>新建评测集</CardTitle>
          <CardDescription>
            问题由人编写（KD-011：v1 不做合成 QA）。从语料自动生成的问题只能证明"刚索引的东西能被检索到"，
            那是同义反复，不是质量基线。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-sm">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="集合名称"
            aria-label="集合名称"
            className="w-[20rem] max-w-full"
            disabled={busy || !live}
          />
          <NativeSelect
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            aria-label="评测范围"
            wrapperClassName="w-[16rem]"
            disabled={busy || !live}
          >
            <option value="">全部可见资产</option>
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
                return "评测集已创建。加题目后即可运行。";
              })
            }
          >
            <Icon name="plus" />
            新建
          </Button>
        </CardContent>
      </Card>

      {sets === null ? (
        <EmptyState title="正在加载…" />
      ) : sets.length === 0 ? (
        <EmptyState title="还没有评测集" description="建一个，写几道题，就能开始比较每次改动的效果。" />
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
                <span className="shrink-0 font-mono text-code-sm text-muted-foreground">{s.questionCount} 题</span>
                <span className="shrink-0 text-body-sm text-muted-foreground">
                  {s.kbScope.length === 0 ? "全部资产" : `${s.kbScope.length} 个资产`}
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
              <CardTitle>{activeSet.name} · 题目</CardTitle>
              <CardDescription>
                期望证据<strong>从文档里选</strong>，不手打 id：手打一个错 id 会造出永远满足不了的题，
                看起来像检索失败，其实是题写错了。选的是<strong>文档</strong>而非分块——分块 id 每次重建都会重生。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-sm">
              {questions.map((q) => (
                <div key={q.id} className="flex items-start gap-md border-t border-border/60 py-sm first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-body-md">{q.question}</div>
                    <div className="mt-2xs text-body-sm text-muted-foreground">
                      {q.expectedEvidence.length === 0 ? (
                        <span className="text-warning-text">未指定期望证据——运行时会跳过这一题</span>
                      ) : (
                        `期望证据 ${q.expectedEvidence.length} 项`
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
                    删除
                  </Button>
                </div>
              ))}

              <div className="flex flex-col gap-sm border-t border-border/60 pt-sm">
                <Textarea
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="新问题，例如：小雨条件下单架次时长是多少？"
                  aria-label="新问题"
                  rows={2}
                  disabled={busy}
                />
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="text-body-sm text-muted-foreground">期望证据：</span>
                  {docs.length === 0 ? (
                    <span className="text-body-sm text-muted-foreground">该范围内没有文档可选。</span>
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
                    添加题目
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>运行</CardTitle>
              <CardDescription>
                走的是 Agent 同款检索链路。<strong>基线标签</strong>是这次运行跑在什么之上——
                "这次改动有没有帮助"只有在两次都说清了跑的是什么时才回答得了。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-sm">
              <Input
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                placeholder="基线标签，例如 bge-m3@v2 或 chunk-512"
                aria-label="基线标签"
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
                      ? "运行完成——检测到质量回退，见下方对比。"
                      : "运行完成。";
                  })
                }
              >
                {busy ? "运行中…" : "运行评测"}
              </Button>
              {questions.length === 0 && (
                <span className="text-body-sm text-muted-foreground">先加题目。</span>
              )}
            </CardContent>
          </Card>

          {report && <RunReportCard report={report} />}

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>历史</CardTitle>
                <CardDescription>每次运行与同一集合上一次完成的运行相比。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col py-sm">
                {runs.map((r) => (
                  <div key={r.run.id} className="flex flex-wrap items-center gap-sm border-t border-border/60 py-sm first:border-t-0">
                    <span className="w-[10rem] shrink-0 truncate font-mono text-code-sm">{r.run.baselineLabel}</span>
                    <span className="shrink-0 text-body-sm text-muted-foreground">{f.when(r.run.startedAt)}</span>
                    {r.run.degraded && (
                      <StatusBadge tone="warning" dot={false}>
                        链路降级
                      </StatusBadge>
                    )}
                    {r.regression && (
                      <StatusBadge tone="danger" dot={false}>
                        回退
                      </StatusBadge>
                    )}
                    <span className="ml-auto flex flex-wrap gap-md">
                      {r.deltas.map((d) => (
                        <span key={d.key} className="text-body-sm text-muted-foreground">
                          {METRIC_LABEL[d.key]}
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
                      逐题
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
  return (
    <Card className={report.regression ? "border-t-medium border-t-destructive-border" : undefined}>
      <CardHeader>
        <CardTitle>本次运行</CardTitle>
        <CardDescription>
          {report.run.questionCount} 题
          {report.skipped > 0 && ` · 跳过 ${report.skipped} 题（未指定期望证据）`}
          {report.previous ? ` · 对比「${report.previous.baselineLabel}」` : " · 无可对比的历史运行"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        {!report.answeringAvailable && (
          // The distinction the whole design rests on. A 0% here would read as a
          // quality collapse when the truth is that generation is switched off.
          <Banner
            tone="info"
            title="本机未配置生成后端（Atlas A4），引用准确率与有据回答率本次「未测量」——不是 0%。召回命中率仍然有效。"
          />
        )}
        {report.run.degraded && (
          <Banner tone="warning" title="本次运行链路降级（重排不可用），与未降级的运行不可直接比较。" />
        )}
        <div className="flex flex-wrap gap-lg">
          {report.deltas.map((d) => (
            <div key={d.key} className="flex flex-col">
              <span className="text-body-sm text-muted-foreground">{METRIC_LABEL[d.key]}</span>
              <span className="font-mono text-title-lg leading-[1]">
                {d.current === null ? "—" : `${d.current.toFixed(1)}%`}
              </span>
              <span className={`font-mono text-code-sm ${DIRECTION_TONE[d.direction]}`}>
                {d.direction === "unknown"
                  ? "无可比"
                  : d.delta === null
                    ? "—"
                    : `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)} pp`}
              </span>
            </div>
          ))}
          <div className="flex flex-col">
            <span className="text-body-sm text-muted-foreground">缺口</span>
            <span className="font-mono text-title-lg leading-[1] text-warning-text">{report.run.gapCount}</span>
            <span className="text-body-sm text-muted-foreground">证据没被召回的题</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GapsCard({ gaps }: { gaps: GapRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>逐题结果</CardTitle>
        <CardDescription>缺口在最上面——那是要去看的行，不该被通过的题埋起来。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col py-sm">
        {gaps.map((g) => (
          <div key={g.questionId} className="flex flex-col gap-2xs border-t border-border/60 py-sm first:border-t-0">
            <div className="flex items-center gap-sm">
              <StatusBadge tone={g.recallHit ? "success" : "danger"} dot={false}>
                {g.recallHit ? "已召回" : "缺口"}
              </StatusBadge>
              {!g.grounded && (
                <StatusBadge tone="warning" dot={false}>
                  无引用
                </StatusBadge>
              )}
              <span className="min-w-0 flex-1 truncate text-body-md">{g.question}</span>
              <span className="shrink-0 font-mono text-code-sm text-muted-foreground">
                {g.citedExpected}/{g.citedTotal} 引用命中
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

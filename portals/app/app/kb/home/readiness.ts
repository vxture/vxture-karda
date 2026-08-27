// 首页第一个问题的答案:这套基础设施此刻能不能用。
//
// 150-page-architecture §2.4 把首页的第一块定为「能不能用」,而不是任何一个域的
// 数字。理由写在那里,一句话是:产品有一种「整体不可用」的状态,而在此之前没有任何
// 页面会说它——语料为零时,资产总览显示的是一批「有库、没内容」的库,读起来像没人
// 上传东西,而真相可能是加工管线根本提交不了。
//
// 这个文件是那个判断的纯逻辑:给一组计数,给出状态、原因码和下一步。不查库、不碰
// React,所以「什么情况算不可用」这件事可以被单独钉住。

/**
 * 可用性状态。四档,而不是「好/坏」两档——因为**「还没开始」和「不可用」必须分开**,
 * 而这两者在两档模型里会被压成同一个「没有内容」。150 §5.2 把这条列为空态三分里
 * 今天缺的那一种。
 */
export type ReadinessState =
  /** 有可检索内容,链路通。 */
  | "ready"
  /** 有可检索内容,但有一部分卡住了(部分驻留 / 有常驻失败)。 */
  | "degraded"
  /** 没有可检索内容,而且**有原因**——不是没人用,是用不了。 */
  | "unavailable"
  /** 没有可检索内容,也没有任何东西在等——真的还没开始。 */
  | "empty";

/**
 * 原因码,不是句子。
 *
 * 「码在线上,散文在调用点」——250-i18n-seam 的缝规则。页面按码取文案,所以同一个
 * 状态在两种语言下说的是同一件事,而不是两处各写一遍。
 */
export type ReadinessReason =
  /** 任务驻留在能力未授权上。今天最可能的那一个。 */
  | "capability_not_granted"
  /** 驻留在配额上。会自己好,不用找人。 */
  | "quota_exhausted"
  /** 有失败任务常驻,需要人看。 */
  | "failures_resident"
  /** 有文档正在加工,等一会就有了。 */
  | "processing"
  /** 一份文档都没有。 */
  | "nothing_ingested";

/** 下一步。`null` 表示这一块正常,没有要做的事。 */
export interface ReadinessAction {
  /** `page` = 站内有地方看;`ops` = 这件事要运维做,页面只能指路。 */
  kind: "page" | "ops";
  /** `kind: "page"` 时的去处。 */
  href?: string;
  /** `kind: "ops"` 时,指向仓内那份操作单的路径。页面把它显示成文字,不是链接
   *  ——它不在这个应用里,做成链接是骗人。 */
  runbook?: string;
}

export interface ReadinessInput {
  /** 可检索文档数:`content_state = indexed` 且有 active 版本。 */
  retrievable: number;
  /** 库里的文档总数,不论状态。 */
  documents: number;
  /** 驻留在「能力未授权」上的任务数。 */
  parkedUnavailable: number;
  /** 驻留在配额上的任务数。 */
  parkedQuota: number;
  /** 常驻失败的任务数。 */
  failedResident: number;
  /** 正在加工中的任务数。 */
  inflight: number;
}

export interface Readiness {
  state: ReadinessState;
  reason: ReadinessReason | null;
  action: ReadinessAction | null;
  /** 支撑这个判断的数,给页面显示,也给读的人自己复核。 */
  facts: ReadinessInput;
}

const OPS_GRANTS = "docs/60-operations/40-run-atlas-endpoint-grants.md";

/**
 * 判断顺序是这条规则的全部内容,所以写在这里而不是散在分支里:
 *
 * 1. **先问有没有可检索内容** —— 这是「能不能用」的定义,不是别的指标的推论;
 * 2. 没有的话,**先找有没有人在等** —— 驻留、失败、在途,任何一个都说明「用不了」
 *    而不是「还没开始」;
 * 3. 三者都没有,才是 `empty`。
 *
 * 反过来做会得到那个最贵的错误:把「驻留在未授权上」显示成「还没有内容」。
 */
export function assessReadiness(input: ReadinessInput): Readiness {
  const { retrievable, parkedUnavailable, parkedQuota, failedResident, inflight, documents } = input;

  if (retrievable > 0) {
    // 有内容,但仍要看有没有一部分卡着。能用不等于全都好。
    if (parkedUnavailable > 0) {
      return { state: "degraded", reason: "capability_not_granted", action: { kind: "ops", runbook: OPS_GRANTS }, facts: input };
    }
    if (parkedQuota > 0) {
      return { state: "degraded", reason: "quota_exhausted", action: null, facts: input };
    }
    if (failedResident > 0) {
      return { state: "degraded", reason: "failures_resident", action: { kind: "page", href: "/pipeline/tasks" }, facts: input };
    }
    return { state: "ready", reason: null, action: null, facts: input };
  }

  // 一份可检索内容都没有。是「用不了」还是「还没开始」?
  if (parkedUnavailable > 0) {
    return { state: "unavailable", reason: "capability_not_granted", action: { kind: "ops", runbook: OPS_GRANTS }, facts: input };
  }
  if (parkedQuota > 0) {
    return { state: "unavailable", reason: "quota_exhausted", action: null, facts: input };
  }
  if (failedResident > 0) {
    return { state: "unavailable", reason: "failures_resident", action: { kind: "page", href: "/pipeline/tasks" }, facts: input };
  }
  if (inflight > 0 || documents > 0) {
    // 文档在,只是还没走完。这是「等一会」,不是「坏了」,也不是「还没开始」。
    return { state: "unavailable", reason: "processing", action: { kind: "page", href: "/pipeline/tasks" }, facts: input };
  }

  return { state: "empty", reason: "nothing_ingested", action: { kind: "page", href: "/assets/new" }, facts: input };
}

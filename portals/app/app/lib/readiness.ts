// 就绪度的**判定**(025 §2/§3),与探针(probes.ts)、路由(/api/ready)分开——
// 判定是纯函数,degraded/fail 的口径要能不碰数据库就测。
//
// 每个依赖挂哪一档,按**它坏了产品还剩什么**定,不是按依赖的名气定:
//
//   db     fail —— 一切读写都在里面,没有它没有产品;
//   redis  degraded —— 它只是 RP 会话库(auth/lib/session-store,fail-closed):
//          挂了浏览器侧全部视为未登录,但 agent 的 S2S 工具面(bearer,不走会话)
//          照常供给。「一半的门还开着」是 degraded 的字面义。
//
//   atlas  刻意**不探**:嵌入/生成不可达时文档驻留、检索降档,这些是产品设计好的
//          运行态(四档化),不是「未就绪」——把它算进 readiness,滚动发布会被一个
//          对端抖动卡住,而新旧版本对此表现完全一致。
//
// null(未配置)不算失败:一个没配 redis 的环境(离线/mock)不因此「未就绪」——
// 未配置是事实,不是故障。

export type CheckOutcome = "ok" | "fail" | "off";
export type ReadyState = "ready" | "degraded" | "fail";

export interface Readiness {
  status: ReadyState;
  checks: { db: CheckOutcome; redis: CheckOutcome };
}

export function checkOutcome(probe: boolean | null): CheckOutcome {
  return probe === null ? "off" : probe ? "ok" : "fail";
}

export function readiness(db: boolean | null, redis: boolean | null): Readiness {
  const checks = { db: checkOutcome(db), redis: checkOutcome(redis) };
  const status: ReadyState =
    checks.db === "fail" ? "fail" : checks.redis === "fail" ? "degraded" : "ready";
  return { status, checks };
}

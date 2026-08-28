// 「用不了」的原因,以及去哪修。
//
// 这个文件存在的理由是一次 owner 的纠正(2026-08-28):产品把四种完全不同的
// 「用不了」压成了同一句「模型能力尚未授权」,而它们的**修复人和修复地点各不相同**
// ——一个要运维改环境变量,一个要平台给工作区开通,一个要平台管理面授端点,还有一个
// 要改这个库自己的模型锁。界面说不清是哪一种,等于谁都不知道该动手。
//
// 更关键的是次序:**授权是平台在页面上给一个已注册产品授的**,所以次序只能是
// 上线 → 注册 → 授权。把授权当成开发或上线的前提会造出一个死锁——要求平台给一个还
// 没上线的东西授权。所以产品必须能在未授权状态下正常跑、正常上线,把缺的那一格
// **具体地**说出来,等平台补上。这个文件就是那个「具体地」。
//
// 缝规则(250-i18n-seam):**码在线上,散文在调用点**。这里只产生码,一个字的用户
// 文案都不写;文案在 `_i18n/messages/*`,由界面按码取。

/**
 * 为什么用不了。四档,因为**修复人不同**——这是分档的唯一依据,不是错误来源的分类。
 * 两种原因如果由同一个人在同一个地方修,就不该是两档。
 */
export type UnavailableCause =
  /** karda 侧没有接上 Atlas:缺 base url / 凭据 / 模型锁。**修复人:运维**,改这个
   *  部署的环境配置。与平台无关,平台那边做什么都不会让它变好。 */
  | "atlas_not_configured"
  /** 这个工作区在 `vx_provision.app_instance` 里查不到 karda 实例,于是换不到
   *  aud=atlas 的令牌。**修复人:平台**,给该工作区开通 karda。 */
  | "workspace_not_provisioned"
  /** 端点没有授权给产品 karda(`NOT_ENTITLED` / `ENDPOINT_NOT_ROUTABLE`)。
   *  **修复人:平台管理面**,给产品 `karda` 授这个端点。参数是 endpointCode。 */
  | "endpoint_not_granted"
  /** 点名的模型路由不到(`MODEL_NOT_IMPLEMENTED` / `MODEL_NOT_ROUTABLE`)。
   *  **这一档不是授权问题**:端点可能授得好好的,是这个库锁了一个 Atlas 上不存在或
   *  没上线的模型。修复人是**知识库的属主**(改模型锁)或 Atlas(上这个模型)。
   *  分出来是因为把它显示成「未授权」会让人去平台反复确认一个已经授过的端点。
   *  参数是 modelCode。 */
  | "model_not_routable";

/** 带参数的原因:端点码 / 模型码。没有参数的两档 `arg` 为 null。 */
export interface Unavailable {
  cause: UnavailableCause;
  arg: string | null;
}

/**
 * 驻留时「用不了」的原因,挂在错误上。
 *
 * 仍然 `extends Error`,所以既有的 `instanceof UnavailableError` 分类一处不用改;
 * 加的是**结构化的原因**,而不是把它写进 message 让下游去正则。message 保留人类
 * 可读的诊断串(日志用),`unavailable` 才是给界面的那一份。
 */
export class UnavailableError extends Error {
  readonly unavailable: Unavailable;

  constructor(message: string, unavailable: Unavailable) {
    super(message);
    this.name = "UnavailableError";
    this.unavailable = unavailable;
  }
}

/**
 * 编码进 `processing_task.failure_reason`(以及 `document.failure_reason`)。
 *
 * **为什么复用这个列而不加一列**:它已经在那儿、可空、是 text,而且 `extract-pass`
 * 早就在往里写码(`capability_unavailable`)——它存的从来就不该是英文散文。加一列要
 * 走 DDL 三件套加列锁再占一次 db-init,换来的只是把 `a:b` 拆成两格。
 *
 * 形状 `cause` 或 `cause:arg`。arg 里不会出现冒号(端点码形如 `embedding/default`,
 * 模型码是 Atlas 的标识符),所以按第一个冒号切是安全的——`splitOnce` 而不是 `split`,
 * 这一条有测试钉着。
 */
export function encodeUnavailable(u: Unavailable): string {
  return u.arg ? `${u.cause}:${u.arg}` : u.cause;
}

const CAUSES: ReadonlySet<string> = new Set<UnavailableCause>([
  "atlas_not_configured",
  "workspace_not_provisioned",
  "endpoint_not_granted",
  "model_not_routable",
]);

/**
 * 解回来。**认不出就返回 null**,不猜、不兜底成某一档。
 *
 * 认不出是真会发生的:库里有改判之前写下的旧值(英文散文、`capability_unavailable`),
 * 而把一条旧记录显示成「端点未授权,请去平台授权」会让人跑一趟去修一件没坏的事。
 * 界面对 null 的处理是退回那句笼统的「用不了」——含糊好过指错方向。
 */
export function decodeUnavailable(raw: string | null | undefined): Unavailable | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  const cause = i === -1 ? raw : raw.slice(0, i);
  if (!CAUSES.has(cause)) return null;
  const arg = i === -1 ? null : raw.slice(i + 1);
  return { cause: cause as UnavailableCause, arg: arg && arg.length > 0 ? arg : null };
}

/** 错误若带原因,给出它的编码串;否则 null(交给调用点回落到 `e.message`)。 */
export function unavailableReason(e: unknown): string | null {
  return e instanceof UnavailableError ? encodeUnavailable(e.unavailable) : null;
}

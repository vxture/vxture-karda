# karda -> 平台线：A4 生成端点接入信息请求（karda.ask 已就位，待端点/模型/凭据）

> **发件**：karda 线（vxture-karda）
> **收件**：平台线（vxture，Atlas 经 `@vxture/service-model-platform` 提供）
> **日期**：2026-07-27
> **主题**：`karda.ask` 的 Atlas A4 生成客户端已实现并接线；缺 3 项运行期接入信息即可对真 A4 打通。
> **承接**：`70-2607232158`（契约请求）、`90-2607240921`（回函：A4 已生产运行）、`100-2607240931`（A1/A2/A3 能力需求）。

---

## 0. karda 侧现状（已就位，非请求实现）

`karda.ask` 的生成客户端已按 `90` 函确认的 `ChatRequest` 契约建好并合入主线：
- `AtlasA4Client`：`POST {base}{path}`，`x-vxture-internal-auth` 头，出网守卫（明文 http 仅私网/tailnet），响应内容容错解析（`content` / `answer` / `message.content` / `choices[].message.content`）。
- 组合 `scope（可见集 ∩ 附着）-> BM25 召回 -> A4 生成`，无上下文不生成（不产无据回答），按次计量 `karda.ask`。
- **激活条件**：宿主设 `ATLAS_CHAT_PATH` + `ATLAS_ASK_MODEL` 即从 not_implemented 转为对真 A4 调用；未设则诚实保持 not_implemented。

## 1. 已"试真连"，但端点探测不到（这是本函的由来）

从 karda-app 容器对 `PLATFORM_API_URL`（`http://100.100.197.42:8080`，即 C2/C3 同一内网基址）探测,结果如下：

| 探测 | 结果 |
|---|---|
| C2 对照 `GET /platform/entitlements` | **400**（可用,缺参报错) |
| C3 对照 `GET /usage/consume` | **404**(POST-only,可用) |
| 9 个候选 chat 路径(`/model/chat`、`/chat`、`/atlas/chat`、`/model/platform/chat`、`/v1/chat/completions`、`/generate` 等) | **全 404** |
| 7 个发现性路径(`/`、`/model`、`/model/platform`、`/models`、`/v1/models` 等) | **全 404** |
| 平台主机其它常见模型端口(8081/8090/8000/3000/3060/11434) | **全 closed** |

即:**A4 生成端点不在 `:8080` 的任何可猜路径上,也没有另开可见的模型端口**。契约正本 `40-model-platform.md` 在平台仓,karda 侧无据,无法自行确定端点。

## 2. 请平台线提供 3 项接入信息(karda 拿到即可打通)

1. **A4 chat 端点** —— 完整 URL 或(基址 + 路径)。是否就在 `:8080` 下某个我们没猜到的路径?还是模型平台另有内网地址/端口?(karda 会填入 `ATLAS_CHAT_PATH`,基址复用 `PLATFORM_API_URL` 或按你给的另配。)
2. **有效模型码** —— `karda.ask` 应使用的 `modelCode`(填入 `ATLAS_ASK_MODEL`),以及如何枚举可用模型(便于日后库级选型)。
3. **鉴权姿态** —— A4 是否复用 C2/C3 的 `x-vxture-internal-auth`(同一 `AUTH_INTERNAL_TOKEN`)?还是模型平台另有凭据?

## 3. 请顺带确认的契约要素(karda 已按 `90` 函假定实现)

- **请求**:`{ modelCode, messages:[{role,content}], temperature, maxTokens?, tenantId, applicationId?, applicationType:"internal_service", userId?, usageType:"normal" }`。karda 侧 `tenantId = 调用方 org`,`userId = OBO 用户 sub`。请确认字段名与必填项。
- **响应**:内容落在哪个字段?(karda 现容错解析 `content`/`answer`/`message.content`/`choices[].message.content`,但确认正本字段可去掉猜测。)
- **计量**:token 计量归 Atlas 侧,karda 只按次记 `karda.ask`(不重复计 token),对齐 `90` 函。请确认无需 karda 侧额外上报。
- **错误/限流**:`429` 限流 vs 配额耗尽是否可区分(承 `70` 函 §2 与 `100` 函)?A4 生成路径同样适用。

## 办理清单(平台侧)

- [ ] **1.** 给出 A4 chat 端点(URL 或 基址+路径)。
- [ ] **2.** 给出有效 `modelCode` + 模型枚举方式。
- [ ] **3.** 确认鉴权姿态(复用内网 token 或另发)。
- [ ] **4.**(确认)ChatRequest/Response 字段与计量/限流语义。

拿到 1–3,karda 在宿主 `.env` 设 `ATLAS_CHAT_PATH` / `ATLAS_ASK_MODEL`(+ 必要时 A4 基址/凭据),`karda.ask` 即对真 A4 打通,无需再改代码。

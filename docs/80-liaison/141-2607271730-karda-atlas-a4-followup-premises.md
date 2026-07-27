# karda -> atlas 线（vxture-atlas）：A4 接入前提更正 + karda 侧已完成 S2S 调用方（承 `140`）

> **发件**：karda 线（vxture-karda）
> **收件**：atlas 线（vxture-atlas）
> **日期**：2026-07-27
> **主题**：更正 `140` 函两处已过时的前提（token-exchange 已实现、Atlas 主机已在产），报告 karda 侧 S2S 调用方已建成并接线，重申 `140` 未办项
> **依据**：`140-2607271500` 未办清单；平台线本轮三面对接任务表（控制面 T1/T2 已实现）；平台 `13-infra-allocation-registry`（atlas 行 = worker-02:3100 在产）。

---

## 0. 为什么发本函

`140` 函在两处前提上写的是"待确认/未就绪"，本轮平台线的对接任务表把这两处**证伪**了。前提变了，karda 的接入姿态也变了——从"代码就绪、连通待平台前置"变成"代码就绪、连通只差你线一次正式确认"。故本函更正前提、报告 karda 侧进展，并把球明确踢回本线的三项正式确认。

## 1. 更正 `140` 的两处过时前提

1. **token-exchange 签发端点：`140` §1.2 写"平台侧尚未实现"——已过时。** 平台控制面本轮确认 token-exchange 签发（T1/T2）**已实现在产**。因此 `140` 里"karda 目前拿不到能过验签的 token / 是否需要临时接入路径"这一问**作废**：karda 现在就能用自己的机密客户端凭据（与 C1 同一 `karda` client）向平台 IdP 换取 `aud=atlas` 的 RS256 bearer，无需临时通道。
2. **Atlas 主机：`140` 写"registry 待分配"——已回填。** 平台 `13-infra-allocation-registry` 的 atlas 行已回填 `worker-02:3100`（在产，与 karda 同机）。故 A2.3 的"主机待分配"阻塞在 karda 侧已清除，karda 的 A4 基址已按此确定为 `worker-02:3100`（与 `PLATFORM_API_URL:8080` 分离）。

## 2. karda 侧已完成（本轮，代码已就绪，未连通仅因等你线正式确认）

- **S2S token-exchange 调用方已建成**（service 模式）：`POST {issuer}/oidc/token`，`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`，`audience=atlas`，`client_secret_post` 用 karda 机密客户端；无 `subject_token`，以 `requested_context={org_id, workspace_id}` 声明服务上下文；bearer 短存（300s、无 refresh），按 `(org, ws)` 缓存并在到期前 30s 重签。
- **已动态接线进 A4 客户端**：`AtlasA4Client` 每次调用按本请求的 `(org, ws)` 现取 bearer，`authorization: Bearer <token>` 发往 `{base}/model-platform/chat`；出网守卫只放行内网/tailnet（worker-02 在 tailnet，放行）。静态 token 已移除。
- **激活条件**：`ATLAS_BASE_URL` 一置（+ karda 已有的 OIDC 客户端凭据），`karda.ask` 即从 `not_implemented` 转为真实调用，无需再改代码。
- 单元测试覆盖：token 换取的表单/缓存/按上下文分键/错误路径，以及 A4 客户端"按 (org,ws) 现取 bearer 并投递"。全套 332 用例绿、type-check 绿。

## 3. 重申 `140` 未办项（仅剩你线动作）

karda 侧前置已全部落地，能否发起真实调用现在**只取决于本线**：

- [ ] **1. 端点正式确认**：`POST /model-platform/chat` on `worker-02:3100` 是否即为可达正本？（karda 已按此配置，请确认或纠正 URL/路径。）
- [ ] **2. 鉴权正本**：Atlas 对 `aud=atlas` bearer 的验签要求（JWKS 来源、`aud`/`iss` 校验、是否校 `requested_context` 里的 org/ws）——karda 已按 `product_210 §3` 换票，请确认你线**验票**侧与之对齐。
- [ ] **3. modelCode + 只读模型枚举**：`karda.ask` 用哪个 `modelCode`（karda 填 `ATLAS_ASK_MODEL`）；消费方只读枚举可用模型走哪条路径（库级选型 + 后续选型 UI 需要）。
- [ ] **4.（确认）** ChatRequest/Response 字段正本、计量归属（token 归 Atlas，karda 只按次记 `karda.ask`）、429=`RATE_LIMITED`/403=`QUOTA_EXHAUSTED` 语义——请正式发出/确认那两份仍是草稿的函。
- [ ] **5.** 确认收到 `100` 的 A1/A3/A2 能力需求并告知设计/排期（解锁顺序建议 A1 > A3 > A2）。

一旦 **1-3** 到位，karda 在 worker-02 上置 `ATLAS_BASE_URL` + `ATLAS_ASK_MODEL` 即通，`karda.ask` 端到端连通。

# karda -> platform 线：请确认 Atlas 产品注册是否已在产库执行（`aud=atlas` 令牌的最后一道闸）

> **发件**：karda 线（vxture-karda）
> **收件**：platform 线（vxture）
> **日期**：2026-07-27
> **主题**：`karda -> Atlas` A4 直连的唯一残留——Atlas 是否已作为产品注册进**生产**库（`product.products` 行 + OIDC 客户端映射），使平台 IdP 能签发 `aud=atlas` 的 token-exchange 令牌
> **依据**：atlas 线回函（karda issue **#70** §5）；`product_210`（token-exchange T1/T2）。

---

## 0. 一句话

karda 的 A4 消费侧代码已就绪、Atlas 侧端点/验签已确认，**只差平台侧一个事实**：Atlas 的产品注册有没有真的在**生产**库跑过（`db-init`）。这不是 Atlas 能单方担保的，只有平台线能确认，故直发本线。

## 1. 背景（为什么落到平台线）

- karda 已建成 S2S token-exchange 调用方（service 模式，`aud=atlas`）并接线进 A4 客户端；atlas 线 #70 已确认端点 `POST /model-platform/chat` + 验签 RS256/JWKS，与 karda 实现一致。
- #70 §5 明确纠正了此前"平台签发未实现"的旧前提：**平台的 token-exchange 机制自 2026-07-12 起已在产**（`product_210` T1：`/oidc/token` 的 token-exchange grant；T2：平台面端点双接受）。这一层没有问题。
- **真正未定的一环**：要拿到 `aud=atlas` 这个**特定受众**的令牌（karda 调 Atlas，而非调平台面端点），前提是 **Atlas 已作为一个产品注册在平台侧**——即 `product.products` 有 Atlas 行、且有相应的 OIDC 客户端映射把 `atlas` 认成合法受众。atlas 线说这部分**代码已合并，但是否已对生产库执行（`db-init`）无法由 Atlas 单方担保**，建议 karda 直接找平台线确认。

## 2. 请平台线确认/办理

1. **Atlas 的产品注册是否已在生产库落地？** 即：`product.products`（或等价注册表）是否已有 Atlas 行，且 IdP 侧已能对 `audience=atlas` 的 token-exchange 请求签发令牌。
2. 若**尚未执行**：请安排对生产库执行该注册（与当初给 karda 做 segment A 注册同类的 `db-init` 动作），或告知阻塞点与预期时点。
3. 若**已执行**：请给出确认信号（注册时间/产品行存在即可），karda 据此在 worker-02 置 `ATLAS_BASE_URL` + 任务档，即可发起真实 `karda.ask <-> A4` 调用做端到端验证。

## 3. karda 侧不需要平台做的事（划清边界，免得来回）

- 令牌**由 karda 自己的机密客户端**（与 C1 同一 `karda` client）向平台 IdP 换取，平台无需给 karda 发新密钥。
- 端点/验签/模型选择（`taskProfile` 或租户过滤模型表）都在 karda↔Atlas 两仓之间，已由 #70 敲定，**不需要平台代理或转发**。
- 计量：token 计量归 Atlas，karda 只按次记 `karda.ask`，无需平台额外动作。

## 办理清单（platform 线）

- [ ] **1.** 查 Atlas 产品注册是否已在**生产**库执行（`product.products` 行 + `aud=atlas` OIDC 客户端映射）。
- [ ] **2.**（未执行则）安排执行，或告知阻塞点/时点。
- [ ] **3.**（已执行则）回一个确认信号，karda 即做端到端连通验证。

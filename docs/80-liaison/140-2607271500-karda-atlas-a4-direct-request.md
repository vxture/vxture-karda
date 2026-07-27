# karda -> atlas 线（vxture-atlas）：A4 生成直连接入请求（首次直发，承平台重定向）

> **发件**：karda 线（vxture-karda）
> **收件**：atlas 线（vxture-atlas，2026-07-24 已拆为独立仓）
> **日期**：2026-07-27
> **主题**：`karda.ask` 的 A4 生成端点/模型/S2S 鉴权接入信息（并预告 A1/A3/A2 依赖）
> **依据**：平台线回函 `vxture/docs/80-liaison/60-2607271430`（把 `130` 函重定向到本线——`karda<->Atlas` S2S 链路在两仓之间发生，平台不代理）。

---

## 0. 为什么直发本线（承接说明）

karda 此前的 Atlas 相关函（`70` 契约请求、`90` 收悉、`100` 能力需求）都经平台线，因为当时 Atlas 尚未独立。平台线 `60` 回函已澄清：**Atlas 于 2026-07-24 拆为独立仓 `vxture-atlas`，`karda<->Atlas` 的调用链路（端点/modelCode/鉴权）完全在你我两仓之间，平台不代理、不转发**。故本函直发本线，正本契约应落你仓 `docs/30-design/`。

karda 侧现状:`karda.ask` 的 A4 生成客户端已建好并合入生产(`AtlasA4Client`:内网 `POST {base}{path}`、容错解析响应内容、S2S 出网守卫),**激活只差端点 + modelCode + 可通过验签的凭据**——三者一到,改 `.env` 即通,无需再改代码。

## 1. 请正式确认 A4 接入信息（平台仅转述了一份未发草稿，不足为据）

平台 `60` 函明确其转述来源是你仓一份**标注"草稿、尚未正式发出"**的文件(`vxture-atlas/docs/80-liaison/30-2607271000-...`),**不构成正式对接确认**。故以下三项请本线正式给出:

1. **端点**:草稿称 `POST /model-platform/chat`(`ModelRuntimeController`),主机预期 `worker-02:3100`,但平台 `docs/50-deployment/13-infra-allocation-registry.md` 里 Atlas 行仍是"待分配"。**请正式确认可达的端点 URL(基址 + 路径)**。若与 karda 的 `PLATFORM_API_URL:8080` 不同基址(应当不同),karda 会另配 A4 基址。
2. **鉴权**:草稿称 A4 走 **S2S token-exchange**(RS256 + JWKS,`product_210`),**不是** karda `130` 函假设的 `x-vxture-internal-auth`(那是 C2/C3 用的)。但草稿又称**平台侧签发 token-exchange 的端点尚未实现**,即 karda 目前拿不到能过验签的 token。请确认:(a) A4 的验签要求正本;(b) 在平台 token-exchange 落地前,是否有临时接入方式,还是必须等它——这决定 karda 是"现在就能连通"还是"代码就绪、连通待平台前置"。
3. **modelCode / 模型枚举**:`karda.ask` 应使用哪个 `modelCode`(karda 填 `ATLAS_ASK_MODEL`)?消费方如何**只读枚举**可用模型(用于库级选型)?草稿提到管理面 `/model-platform/admin/*` 走运营凭证,但消费方需要的只读视图走哪条路径未明。

## 2. 契约要素确认（karda 已按 `40-model-platform.md` §7 实现，请确认或纠正）

- **请求**:`{ modelCode, messages:[{role,content}], temperature, maxTokens?, tenantId, applicationId?, applicationType:"internal_service", userId?, usageType:"normal" }`。karda 侧 `tenantId = 调用方 org`,`userId = OBO 用户 sub`。
- **响应**:生成内容落在哪个字段?(karda 现容错解析 `content`/`answer`/`message.content`/`choices[].message.content`,正本确认后可去掉猜测。)
- **计量**:token 计量归 Atlas,karda 只按次记 `karda.ask`,互不重复(承 `90`/`100`)。请确认无需 karda 额外上报 token。
- **429 vs 配额**:平台转述你线已有明确答案(`RATE_LIMITED`→429+`Retry-After`;`QUOTA_EXHAUSTED`→403),但**该答案也在一份未正式发出的草稿**(`vxture-atlas/docs/80-liaison/10-2607241030-...`)里。该设计决策 karda 可直接采信(karda 据此:429 退避重试,配额耗尽挂起 `suspended_quota` 不落 failed),但**请正式发出/确认**,勿默认已达。

## 3. 预告:A1 / A3 / A2 仍是 karda 的硬依赖（承 `100` 函）

A4 只解锁 `karda.ask` 的生成段。karda 的加工与向量检索仍卡在:

- **A1 embedding**(最硬):无 embedding,文档进不了向量索引,`karda.search` 的向量召回路径无法真实跑通(BM25 词法召回已自建、可先行)。**库级锁定模型版本**是硬诉求(换版本 = 受控重建)。
- **A3 rerank**:统一精排,单次候选池 v1 上限 100,预算 P95 < 400ms(若不现实请尽早指出,karda 会下调 N)。
- **A2 解析类小模型**:高频小请求、延迟敏感,诉求批量接口 + 部署亲和。

`100` 函已把这三项的字段级需求发出(当时经平台线)。请确认已收到,并告知 A1/A3/A2 的设计与排期——解锁顺序 karda 建议 **A1 > A3 > A2**。

## 办理清单（atlas 线）

- [ ] **1.** 正式给出 A4 端点(URL/基址+路径) + 主机地址确认。
- [ ] **2.** 确认 A4 鉴权(S2S token-exchange 正本) + 平台 token-exchange 未就绪期间的接入路径。
- [ ] **3.** 给出 `karda.ask` 的 `modelCode` + 消费方只读模型枚举路径。
- [ ] **4.**（确认）ChatRequest/Response 字段、计量归属、429/配额语义（并正式发出那两份仍是草稿的函）。
- [ ] **5.** 确认收到 `100` 函的 A1/A3/A2 能力需求，并告知设计/排期。

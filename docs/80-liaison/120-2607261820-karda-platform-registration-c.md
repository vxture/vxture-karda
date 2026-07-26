# karda -> 平台线：注册段 C（上线后待办：webhook 投递登记、计量键注册、失效密钥清理）

> **发件**：karda 线（vxture-karda）
> **收件**：平台线（vxture）
> **日期**：2026-07-26
> **主题**：karda `v0.2.0` 已上线；请平台侧办理 4 项对接收尾——`product_webhooks`
> 投递地址登记、计量注册表键位登记、失效 repo secret 清理，并同步五档套餐发布依赖。
> **承接**：段 A `20-2607222338` / `40-2607230130`（完成），段 B `40-2607230909`，
> 端口改配 `110-2607241749`，注册 A 回执 `50-2607230957`。

---

## 0. 背景（karda 侧现状，已自验）

- **`v0.2.0` 生产在线**：worker-02（`vx-worker-02` / `100.76.219.48`），发布端口
  **3240**，`https://karda.vxture.com/api/health` 报 `version=v0.2.0`、healthy。
- **本轮上线内容**（karda 自建域）：处理运行时（入队即处理 + 可抽干 tick）、
  Agent 工具 `write_document` / `create_entry`（含逐文档 ingest 计量）、Console
  库/文档管理界面（上传 → 分级库归类 → 逐库分享 + 治理开关）。
- **三通道此前已对真实平台闭环**（见索引"集成状态 2026-07-23"）：C1 完整登录闭环、
  C2 三路探针、C3 四路签名 + 四路投递语义并回查 DB。端口从 3233 切到 3240 后，edge
  已随之更新，公网 502 已解、health 200。

以下 4 项是 karda 侧已就绪、**只差平台侧动作**的收尾。

---

## 1. `product_webhooks` 投递地址登记 -> `http://vx-worker-02:3240`（C3 真正生效的前置）

karda 的 C3 入站已完整实现并验证（签名 `t=,v1=` + ±300s 重放窗 + seq 水位 +
幂等），但**平台不向 karda 发投递，C3 就始终是"能收却收不到"**。

- **投递地址**：`http://vx-worker-02:3240`（tailnet 内直达，不经公网 edge）。
  MagicDNS 不可达时兜底 `http://100.76.219.48:3240`。
- 这是 `40` 段 B 与 `110` 端口改配都请求过的项；`110` 状态仍是"平台 syncing"。
  **请确认已登记为 3240，或补登记**。edge 侧（公网 vhost）已确认在 3240，此项独立于
  edge，走的是平台 -> 主机的内网直达。
- 一旦登记，建议平台发一条 `subscription_changed` 或任意测试投递，karda 侧会回执
  处理结果，双方即可确认闭环（karda 会在收到后回报一次，如 `60` 函同款自测）。

## 2. 计量注册表键位登记（karda 已开始产生用量）

karda 自 `v0.2.0` 起会向 `POST {PLATFORM_API_URL}/usage/consume` 上报计量。本地
buffer 的每条 `metric` 必须命中**平台计量注册表**的 key，否则 consume 会拒收、用量
只能在本地累积不落账。请登记以下三个 key（取自 karda 工具目录 `catalog.ts`）：

| metric key | 类型 | 触发 | 归属 | 当前状态 |
|---|---|---|---|---|
| `karda.ingest` | per_doc（COUNTER） | `write_document` / `create_entry` / Console 上传成功 | 库所属 workspace（非调用方），幂等键 = 新行 id | **已在产生** |
| `karda.search` | per_call | `karda.search` | 调用方 workspace | 已声明，召回（BM25/A1）落地后启用 |
| `karda.ask` | per_call | `karda.ask` | 调用方 workspace | 已声明，A4 已具备、随召回启用 |

`karda.ingest` 是当前唯一已实际产生的计量，优先登记。三者也将是第 3 项五档套餐
配额池（quota_pools）要挂靠的度量，两件事的 key 命名需一致。

## 3. 删除失效的 repo secret `OIDC_CLIENT_SECRET`（承 `50` 函 R2）

`50` 函 R2 已指出：该 secret 作为 GitHub repo secret 是**失效**的——部署链没有任何
一步读取它，且 GitHub secret 只写不可回读。真实值已改由**宿主 `.env` 直接交付**并
验证有效（C1 完整登录闭环即证）。仓库里那份既无效又构成误导性的凭据面，**请予删除**
（dev 阶段公开仓，"凭据绝不入库"是硬规，即便失效副本也应清掉）。

## 4. 五档商业套餐（DRAFT -> 发布）——依赖同步，暂不请求发布

段 A 已在生产 DB 落了 karda 产品行、OIDC client 与**五档 DRAFT 套餐骨架**。发布前置是
karda 的 **档位 -> 权益/配额映射**，它取决于两项 owner 待批决策与产品定义定稿：

- **KD-202**（私有库留存）、**KD-203**（实例化/归档计量）——直接决定配额池度量与留存口径；
- `20-specs/10-product-definition.md` 到 **v1**。

这两项落定后，karda 将**单独发一封"档位->权益映射"函**，届时再请平台把五档从 DRAFT
发布。**本函仅同步该依赖，不请求现在发布**；此处提前对齐的是：映射函所用度量 key 将与
第 2 项登记的 `karda.ingest` / `karda.search` / `karda.ask` 完全一致。

---

## 附：当前对接快照

| 项 | 值 |
|---|---|
| 版本 / 构建 | `v0.2.0` / `sha-21cfc6b` |
| 主机 / 端口 | worker-02（`100.76.219.48`）/ **3240**（beta 3241 仍随 beta 服务器延后） |
| 公网面 | `https://karda.vxture.com`（edge 在 3240，health 200，`/console` 200） |
| C1 issuer | `https://accounts.vxture.com`（公网面，JWKS 200） |
| C2/C3 内网基址 | `PLATFORM_API_URL=http://100.100.197.42:8080`（探针 200，用量走此基址 `/usage/consume`） |
| webhook 投递地址 | `http://vx-worker-02:3240`（**待平台登记**，见第 1 项） |

## 办理清单（平台侧）

- [ ] **1.** `product_webhooks` 投递地址登记 / 确认为 `http://vx-worker-02:3240`，并发一条测试投递。
- [ ] **2.** 计量注册表登记 `karda.ingest`（优先）、`karda.search`、`karda.ask`。
- [ ] **3.** 删除失效 repo secret `OIDC_CLIENT_SECRET`。
- [ ] **4.**（仅同步）知悉五档发布依赖 KD-202/203 + 产品定义 v1；karda 后续单独发映射函。

beta（`karda-beta` / 3241）仍随 beta 服务器延后（TD-001），本函不办理。

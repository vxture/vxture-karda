# karda → arda 线：内容通道契约五项对齐请求

> **发件**：vxture-karda（产品线）
> **收件**：arda 线（vxture-arda）
> **时间**：2026-07-22 23:38（stamp 2607222338）
> **主题**：`Karda × Arda 内容通道契约` v0.1 跨产品评审——请对齐五项 Arda 侧义务
> **状态**：open — 契约 **v0.1 在 Arda 侧回复前不定稿**
> **契约正本**：`vxture-karda` 仓 `docs/30-design/200-arda-channel.md`（本函不复制其全文，只摘要 + 提问）
> **上游依据**：`product_110_sharing-isolation`（连接=Arda、理解=Karda；属主拉动；级联撤销）、
> `product_210_tool-protocol` v1.0（S2S 身份、C3 webhook 域）

---

## 1. 请求要旨

karda 已产出双方内容通道的契约草案 v0.1。契约中 **Arda 侧承担的义务**有五处需要贵线确认可行性
与具体档位——这五项都不是 karda 能单方定的，**契约在收到回复前不定稿**。同时它卡着 karda 三份
下游设计：加工管线（Arda 摄取路径）、对象模型（`source_ref` 血缘）、检索侧（撤销级联的失效语义）。

本函不要求贵线阅读契约全文，§2 摘要足以回答 §3 的五个问题；需要细节时再取正本。

## 2. 契约摘要（Arda 侧需要知道的部分）

**边界**：`product_110` 的"连接=Arda、理解=Karda"落为可执行语义。Arda 负责源系统认证/分页/限流、
**变更检测**、同步调度、交付信封组装与稳定 ID 保障、撤销事件发出；Karda 负责通知消费、内容拉取、
幂等去重、解析/分块/索引、失败驻留与重试、撤销级联失效。本通道**只走非结构化内容**——结构化
数据服务不经此通道，由 Arda 数据服务面自理。

**通道模型**：`Binding` = Karda 知识库 ←订阅→ Arda DataSource。多对多（一库可绑多源、一源可被多库
订阅，各 Binding 独立 cursor）。模式 backfill → incremental。状态 active / paused / revoked。

**传输语义**：**notify-then-pull**——轻量变更通知经 C3 webhook 域投递 Karda，内容本体由 Karda 凭
`fetch_ref` **直连 Arda 拉取**（service 模式 S2S，`aud=arda`、`act.sub=karda`）。事件通道不承载大
载荷；数据面保持产品直连（`product_110` §7 唯一直连原则）。at-least-once + 幂等，幂等键
`(binding_id, source_doc_id, content_hash)`。顺序**仅承诺同一 `source_doc_id` 内按 `detected_at` 有序**，
跨文档不承诺全局序。

**信封**（v1 关键字段）：`event`（`upsert`/`delete`/`revoke_binding`）、`binding_id`、
**`source_doc_id`**、`content_hash`、`source_ref{datasource_id,uri,external_version}`、
`timestamps{source_modified_at,detected_at}`、`content{mime,size,fetch_ref}`、`source_metadata`。

**删除**：墓碑事件（`event: delete`）。源侧"移出同步范围"（如文件移出被订阅目录）**等价于 delete**。

**撤销**：`revoke_binding` 事件（源侧撤销共享 / DataSource 删除 / 属主权限丧失）→ Karda 置 Binding
终态、血缘下全部内容立即从召回排除、异步物理清除、血缘留至审计期。

**身份**：Binding 登记走 **OBO**（属主身份，由 Arda 校验属主对该 DataSource 的权限）；后续增量运行
切 service 模式。

**Karda 侧 v1 明确不做，需贵线知晓**：**不透传源侧 ACL**。Karda 的权限单元是"库"（库级发布阶梯 +
可见集），源内细粒度权限不映射。属主绑定源即承诺该源内容以库为单元治理；源内含差异密级内容的
正确用法 = 拆 DataSource 范围或拆库。信封保留 `source_metadata` 透传位，v2 若引入 ACL 映射不破坏
契约。**如果贵线认为此简化在某类连接器上不可接受（如源系统本身按用户维度授权），请在回复中指出**
——这会改变 v1 的边界设定。

## 3. 请对齐的五项

### A1 稳定 ID 保障强度

- **Karda 立场**：`source_doc_id` **跨同步周期恒定**是硬契约。它是幂等键的一部分，也是墓碑删除与
  增量更新的唯一锚点。
- **请确认**：各连接器类型能否保障？尤其**文件移动/重命名**场景的 ID 策略——若 ID 随路径变化，
  一次移动会在 Karda 侧表现为"删除 + 新增"，导致重复加工、血缘断裂、以及已有引用失效。
- **若某类源无法保障**：请说明是哪类，karda 需为其设计降级路径（如以 `content_hash` 辅助识别
  搬迁），但那是有损的，不宜作默认。

### A2 `fetch_ref` 形态

- **Karda 立场**：短时效凭据化引用；签发与校验机制**归 Arda 实现**。
- **请确认**：时效档位（契约草案假定 **≤300s**，与 token TTL 对齐）与"单资源、不可转用"约束是否
  可实现；过期后 Karda 凭 `source_doc_id` 重新请求引用的接口形态。
- **相关错误语义**（草案已假定，请确认）：`401` token 过期→重换；`403` Binding 已 revoked→停止拉取
  并触发级联；`404` `fetch_ref` 过期→重新请求引用；`429` 限流→退避。

### A3 一致性核对接口

- **Karda 立场**：需要 Binding 级清单比对接口（`source_doc_id` + `content_hash` 列表），用于定期
  校验与故障恢复，**替代盲目全量重灌**。
- **请确认**：接口成本与频控约定。若清单规模大，是否支持分页/增量游标/按时间窗切片？
- **理由**：at-least-once 交付 + 长期运行必然产生漂移；没有对账接口，唯一的恢复手段就是全量重灌，
  那对双方都是不可接受的成本。

### A4 增量延迟 SLO

- **Karda 立场**：**按连接器类型分级声明**，不要求统一档位。契约草案只承诺"分钟级、不做秒级实时"。
- **请提供**：各源类型可承诺的档位（哪怕是粗档，如 ≤5min / ≤30min / ≤4h）。
- **用途**：karda 需据此向属主呈现"内容多久后可被检索到"的预期，并设定加工侧的 backlog 告警阈值。
  没有档位声明，这两处只能拍脑袋。

### A5 死信可见面

- **Karda 立场**：投递失败退避重试，上限后进 **Arda 侧死信**，Arda Console 可见。Karda 侧的拉取/
  解析失败则落 `failed` 驻留态，属主在 Karda 侧可见可重试，**不阻塞同 Binding 其他文档**（毒丸隔离）。
- **请确认**：Arda Console 是否呈现投递死信；以及**是否需要与 Karda 的 `failed` 态打通成联合排障
  视图**。
- **背景**：同一份内容的失败可能落在通道两侧的任一端，属主看到的是"这份文档没进来"。若两侧各看
  各的，排障要在两个 Console 之间来回跳。是否值得打通由双方共同判断——karda 不单方主张。

## 4. 回复方式与后续

- 贵线可在 `vxture-arda` 仓 `docs/80-liaison/` 回函，本仓记收悉与跟进（入函正本留发信仓，
  同一主题只在一处有正本）。
- 五项全部对齐后，karda 将 `200-arda-channel` 由 v0.1 升为定稿，并据此推进
  `110-processing` 的 Arda 摄取路径实现。
- **部分回复即有价值**：A1/A2 是契约能否成立的基础（不成立则整个 notify-then-pull 模型要重设计），
  A3/A4/A5 是工程档位，可后续补齐。若贵线只能先答 A1/A2，请先答。
- 契约后续演进：`envelope_version` 随信封声明，新增字段向后兼容，语义变更升版双版本过渡
  （对齐 `product_210` §7）。

## 5. 计量分工（已在契约固化，供核对）

拉取与同步流量归双方各自基础设施成本，不进业务计量。Karda 摄取计量 `karda.ingest` per_doc
（经 C3，记属主 WS，来源以维度区分 upload/api/arda_sync）；Arda 侧同步计量归 Arda 自报，
**互不重复**。如贵线对此分工有异议请一并指出。

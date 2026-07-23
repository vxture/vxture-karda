# 外接源连接器框架（Connector Framework）(220-connector-framework)

> 版本：v0.1
> 状态：Draft
> 上游文档：10-product-definition §4-9（载体/语义边界）、100-kb-model（Document 对象、source/connector_code、
> failed 驻留）、110-processing（三级队列、增量、重建）、210-data-model（表结构）
> 定位：定义 karda 接入**任意外部知识/文档源**的通用契约；`200-arda-channel` 是本框架的**第一个实现**
> 方向依据：**2026-07-23 调整**——karda 自建非结构化存储与向量库、自闭环支撑业务；陆续开放外接
> 知识库/文档库能力；**Arda 视为内部三方**，不是架构对等方

---

## 1. 为什么需要这一层

原设计把 Arda 通道写成了产品间的**对等契约**（`200-arda-channel` 独占 2xx 契约段、批次 7 被它完全阻塞）。
方向调整后这不成立了：Arda 只是"比较方便接的一个内部源"，与将来接的 SharePoint / Confluence /
对象存储 / 网盘并无架构地位差别。

若不先抽出通用层，第二个连接器接入时会发现整套机制是**按 Arda 的形状长的**——尤其是"源会主动推
通知"这个假设，恰恰是 Arda 的特例而非通例。

**本框架的验收标准**：接入一个新连接器，只需实现 §4 的能力接口 + 登记一行 `connector_code`，
**不改 DDL、不改加工管线、不改检索侧**。

## 2. 不变量（任何连接器都必须满足）

这五条是 karda 侧加工与治理逻辑的地基，连接器不满足则不能接入：

| # | 不变量 | 不满足会怎样 |
|---|---|---|
| I1 | **稳定 ID**：`source_doc_id` 跨同步周期恒定 | 一次源侧移动/重命名 = karda 侧"删除 + 新增"，重复加工、血缘断裂、既有引用失效 |
| I2 | **内容可寻址**：能按 `source_doc_id` 取回内容字节 | 无法重建索引，`storage_ref` 首次落地后即无法校验 |
| I3 | **变更可判定**：能给出 `content_hash` 或等价变更判据 | 只能全量重灌，`110-processing` 的"仅处理 delta"失效 |
| I4 | **删除可表达**：能表达"该对象已不在同步范围内" | 撤稿/删除的内容永久留在索引里——这是**合规问题不是体验问题** |
| I5 | **访问属性可声明**：至少能声明该源整体的可见性归属 | 无法判断内容该落哪个库、进哪个命名空间 |

I1 是最容易被低估的一条。它不是"最好有"，而是**幂等键的组成部分**——karda 的去重唯一键是
`(kb_id, source, connector_code, content_hash)`，而增量更新与墓碑删除都按 `source_doc_id` 定位。

## 3. 通道模型：Binding

```
KnowledgeBase(karda) ←订阅→ ExternalSource(连接器侧的一个可同步范围)
  ├── 创建：属主在建库/配库流程中选择其可及的外部源；以 OBO 身份向连接器登记（属主权限校验在连接器侧）
  ├── 关系：多对多（一库可绑多源；一源可被多库订阅，各 Binding 独立游标）
  ├── 模式：backfill(首次全量，走 bulk 队列) → incremental(常驻增量，走 sync 队列)
  ├── 状态：active / paused(属主暂停) / revoked(源侧撤销，终态，触发 §7 级联)
  └── 检查点：连接器侧同步位点 + karda 侧消费位点，双方可对账
```

**Binding 是权限与计费的挂载点**：绑定即属主承诺"该源范围内的内容以本库为单位治理"（见 §8）。

## 4. 连接器能力矩阵（框架的核心）

不同源的能力差异很大，框架按**能力声明**适配，而不是假设所有源都像 Arda：

| 能力 | 取值 | 说明 |
|---|---|---|
| `change_detection` | `source` \| `karda` | 源侧自己检测变更（Arda）；还是 karda 轮询比对（多数第三方库） |
| `delivery` | **`poll`（默认）** \| `notify` | karda 按计划拉取；还是源能主动推通知 |
| `fetch` | `direct` \| `ref` | 直接返回内容字节；还是返回短时效引用再由 karda 取件 |
| `reconcile` | `list` \| `none` | 是否提供 `(source_doc_id, content_hash)` 清单比对接口 |
| `delete_signal` | `tombstone` \| `absence` | 显式删除事件；还是只能靠"清单里消失"推断 |

**`poll` 是默认而非 `notify`。**这是本框架相对 `200-arda-channel` 最重要的一处翻转：Arda 能经 C3
webhook 域推通知，是因为它在同一个平台内、有现成事件通道；一个外部文档库通常**没有**任何方式
主动通知 karda。把 notify 当默认，等于把特例当通例。

能力降级的代价必须被明确接受，而不是悄悄兜底：

- `change_detection=karda` → karda 承担轮询成本，增量延迟受轮询周期下限约束；
- `reconcile=none` → 无法定期对账，长期运行的漂移只能靠全量重灌恢复；
- `delete_signal=absence` → 删除的发现延迟 = 一个完整轮询周期，**且必须做全量清单比对才能发现**，
  这是 I4 的最弱满足形式，敏感内容源不应接受。

## 5. 传输语义（与投递方式无关）

- **at-least-once + 幂等**：幂等键 `(binding_id, source_doc_id, content_hash)`；hash 未变直接 ack 跳过
  （同时覆盖"改了又改回"的伪变更）；
- **顺序**：仅承诺**同一 `source_doc_id` 内**按变更时间有序，跨文档不承诺全局序（按文档为处理单元即可）；
- **背压**：karda 加工队列深度超阈值时放缓拉取；`notify` 型源的通知可积压，`poll` 型源直接拉长周期；
- **毒丸隔离**：单文档失败落 `failed` 驻留态（属主可见可重试），**不阻塞同 Binding 其它文档**；
- **原始留存**：取回的字节落 karda 自有对象存储（`document.storage_ref`），此后重分块不重解析、
  重索引不重下载，**且不依赖源持续可达**。

最后一条是自闭环的落点：karda 不是外部源的缓存视图，它持有自己的副本。

## 6. 最小摄取信封

无论 `poll` 还是 `notify`，连接器交给 karda 的都是同一组字段：

```jsonc
{
  "binding_id": "...",
  "event": "upsert" | "delete",
  "source_doc_id": "...",        // I1 稳定 ID
  "content_hash": "sha256:...",  // I3 变更判据；delete 事件无此字段
  "source_ref": { "uri": "...", "external_version": "..." },
  "timestamps": { "source_modified_at": "...", "detected_at": "..." },
  "content": { "mime": "...", "size": 1234,
               "bytes": "..." | "fetch_ref": "..." }   // 依 fetch 能力二选一
}
```

落库映射（`210-data-model` §3.6）：`source='connector'`、`connector_code=<连接器>`、
`source_ref` 存指针、`content_hash` 存判据、内容字节落 `storage_ref`。

## 7. 撤销与级联

Binding 转 `revoked` 时：① Binding 置终态；② 其血缘下全部 Document/Chunk/索引**立即从召回排除**
（不等待物理清除）；③ 异步物理清除；④ 血缘记录保留至审计期。

**平台侧的 `visible-set-invalidate`（授权视图失效）是独立事件**，karda 分别消费、召回前双重检查
（白名单 ∧ 内容可见），任一先到都不产生泄漏窗口。

## 8. v1 的有意简化：不透传源侧 ACL

**karda 的权限单元是"库"，不是文档。**绑定一个源即属主承诺该源范围内的内容以本库为单位治理；
源内部的细粒度权限不映射进来。

代价必须讲明：若一个源里混着不同密级的内容，绑进同一个库会把它们**拉平到该库的权限层级**。
正确用法是**收窄源范围**或**拆库**。

这不是疏漏——信封保留 `source_ref` 与访问属性透传位，v2 若引入 ACL 映射不破坏契约。但它是
**产品必须在绑定界面上向属主显式讲清的约束**，否则就是个数据泄漏陷阱。凡 `delete_signal=absence`
或源本身按用户维度授权的连接器，尤其不适用本简化。

## 9. 身份与鉴权

- **Binding 登记走 OBO**（属主身份）——订阅关系的建立必须经属主权限校验，与"创建/写入类工具仅 OBO"同源；
- **增量运行走 service 模式**——后台任务不冒用用户身份；
- 凭证由连接器实现自持（karda 侧只存引用，不存第三方长期凭据明文）；
- 对外部源的出网遵循 S2S 出网守卫：明文 http 仅允许 loopback/私网/tailnet，公网必须 https。

## 10. 与 `200-arda-channel` 的关系

`200-arda-channel` 自此为**本框架的第一个连接器实现**，其能力声明为：

| 能力 | Arda 的取值 |
|---|---|
| `change_detection` | `source`（Arda 侧 cursor/CDC/hash 轮询） |
| `delivery` | `notify`（经 C3 webhook 域） |
| `fetch` | `ref`（`fetch_ref` 短时效引用，S2S `aud=arda` 直连取件） |
| `reconcile` | `list`（Binding 级 id+hash 清单比对）— **待 Arda 确认** |
| `delete_signal` | `tombstone` |

`200` 中属**通用**的部分（Binding、幂等、顺序、毒丸隔离、撤销级联、不透传 ACL）已上提至本文；
`200` 保留 Arda 特有的部分：C3 webhook 域为通知通道、`arda://content/{token}` 引用形态、
`aud=arda` 的 S2S、Arda DataSource 概念、以及 §12 待 Arda 确认的五项。

**优先级变化**：Arda 不再是架构前置。`200` 的五项待确认原本被标为"契约能否成立的基础"，
现在它们只影响 **arda 这一个连接器**的可用性，不阻塞连接器框架、不阻塞 karda 主线。

## 11. 待拍板项

| # | 决策项 | 倾向建议 | 状态 |
|---|---|---|---|
| 1 | v1 首批开放哪些连接器 | Arda + 一个 poll 型外部源 | 半外部 KD-105 |
| 2 | `reconcile=none` 的源是否允许接入 | 允许但标注无对账、禁敏感内容 | **已定 KD-013** |
| 3 | 轮询周期下限 | 按连接器声明 + 全局下限 | **已定 KD-014** |
| 4 | 第三方凭据托管形态 | 复用平台密钥设施 vs 自建 | 外部 KD-106 |

## 12. 联动登记

- `210-data-model`：`document.source='connector'` + `connector_code` 已落地；**Binding 表见 §3，
  随本框架同批落 DDL**；
- `110-processing`：`poll` 型源的调度进 `sync` 队列，backfill 进 `bulk` 队列；
- `200-arda-channel`：降为实现层，见 §10；
- `10-product-definition` §8 对外接口关系表：Arda 行的表述应随之调整（对等契约 → 连接器实现）。

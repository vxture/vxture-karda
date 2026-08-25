# Karda 五档能力矩阵（Tier Capability Matrix）(40-tier-capability-matrix)

> 版本：v0.1
> 状态：**提案 — 待 owner 批复**。批复后填入 `entitlement/capability.ts` 的 `CAPABILITY_MATRIX`，
> 并由平台侧发布五档套餐
> 上游文档：10-product-definition §4/§9/§11、30-agent-knowledge-blueprint（定位权威）、
> product_220 §3（门禁公式与值域权威）、240-ops-read-models（计量键）
> 定位：karda 的 tier → 能力键 / 上限 / 配额池 映射。这是**平台发布五档套餐的前置输入**，
> 也是 C2 从"通道通、业务空"变成真正生效的唯一缺件

---

## 1. 为什么这份文档是总闸

C1、C3 已闭环，C2 通道也通，但**五档套餐仍是 DRAFT**，于是：

- `hasProductAccess(e)` 判据是 `e.tier != null`，未订阅时恒为 false；
- `CAPABILITY_MATRIX` 五档**全是空数组**，`canUseFeature` 对任何键都返回 false；
- `limits{}` 为空，而 `withinCap` 在**上限缺省时 fail-closed 拒绝**。

也就是说配额与能力门禁都在跑，但什么都没门控住。这份矩阵定下来，商业面才从空转变成生效。

## 2. 三种杠杆（机制是继承的，取值是 karda 的）

| 杠杆 | 载体 | 语义 | 谁定 |
|---|---|---|---|
| 能力键 | `CAPABILITY_MATRIX: Record<Tier, FeatureKey[]>` | **累积式**：高档包含所有低档 | karda（本文） |
| 上限 | `Entitlement.limits: Record<string, number>` | max 型，`-1` = 无限，产品自行计数 | karda 出键，平台配值 |
| 配额池 | `Entitlement.quota_pools[]` | 可消耗型，**必须命中平台计量注册表键位** | 平台 |

**档位名不可自定义**：`free / starter / pro / business / enterprise` 来自 `@vxture/shared` 的 `TIERS`，是平台值域。

**`bundled` 是独立轴**，与 tier 并存：`hasDataAccess` 包含 bundled，`hasProductAccess` 不含。所以捆绑进来的工作区**能被别的产品读数据、但不能用 karda 的界面**——这是有意的，不是遗漏。

## 3. 定档逻辑：按成本驱动与价值跃迁切，不按功能数量切

karda 的成本与价值不是均匀分布的，四条线决定了档位边界：

1. **Atlas 调用是真金白银**（embed / rerank / ask）。免费档给向量检索等于替所有人付模型账。
2. **共享范围是企业价值的主轴**。私有 → 工作区 → 组织，每跳一级价值跃迁一次。
3. **Agent 写入是本产品的定位**（蓝图 §11 的沉淀闭环）。它是产品从"检索工具"变成"知识基础设施"的那一步，必须是付费跃迁。
4. **治理与合规是企业采购的硬条目**，不是加分项。

## 4. 五档

| 档 | 一句话 | 关键词 |
|---|---|---|
| **free** | 一个人把资料放进来、搜得到 | **私有 · 词法检索 · 无 Agent** |
| **starter** | 团队用起来，Agent 能读 | **语义检索 · 带引用问答 · Agent 只读** |
| **pro** | Agent 沉淀闭环打开，知识开始被治理 | **Agent 沉淀 · 验证治理 · 知识包订阅** |
| **business** | 组织级共享与外部数据接入 | **组织共享 · 数据源接入 · 知识包实例化** |
| **enterprise** | 合规、质量与专属资源 | **审计合规 · 质量基线 · 专属并发** |

### free — 私有 · 词法检索 · 无 Agent

给的是"能用"，不是"能试"。上传、快速路径解析、模板化分块、BM25 检索、检验台自测都在。**刻意不给向量**：那是 Atlas 成本，也是升级的第一个理由。

### starter — 语义检索 · 带引用问答 · Agent 只读

补上双路召回 + RRF + 精排 + `karda.ask`，加工作区共享，开 `karda.kb-read`（直供与 Runos 两条通道的只读面）。**这是"知识能被 agent 用"的最低档**。

### pro — Agent 沉淀 · 验证治理 · 知识包订阅

开 `karda.kb-write`：agent 写入落 draft、走管线、进治理阶梯。同时开验证状态机与续验策略——**沉淀与治理必须同档开**，让 agent 写进来却不能治理，是在制造污染。
承 10-product-definition §9「pro = live 只读订阅」：可订阅平台级知识包（P 级 live 消费）。

### business — 组织共享 · 数据源接入 · 知识包实例化

组织级可见性、连接器订阅（外部数据源接入）、知识包实例化（fork 一份自己改）、受控重建。
承 §9「biz = 可实例化」。

### enterprise — 审计合规 · 质量基线 · 专属并发

审计接入、评测集与质量基线、定向共享、org 自建加工模板、专属并发档。这一档卖的是**可证明**，不是可用。

## 5. 能力键（karda 的空白区，本文定义）

累积式：本档列出的是**新增**，实际拥有 = 本档 + 所有低档。

| 键 | 承载能力 | free | starter | pro | business | enterprise |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `kb.private` | 私有库创建与上传 | ● | | | | |
| `retrieval.lexical` | BM25 词法召回 | ● | | | | |
| `bench.recall` | 检验台自测召回 | ● | | | | |
| `retrieval.vector` | 向量召回 + RRF + 精排 | | ● | | | |
| `answer.cited` | `karda.ask` 单轮带引用问答 | | ● | | | |
| `share.workspace` | 工作区级共享 | | ● | | | |
| `agent.read` | `karda.kb-read`（两条通道） | | ● | | | |
| `agent.write` | `karda.kb-write` / `write_document` / `create_entry` | | | ● | | |
| `governance.verification` | 验证状态机、续验策略、豁免 | | | ● | | |
| `package.subscribe` | P 级知识包 live 只读订阅 | | | ● | | |
| `share.organization` | 组织级共享 | | | | ● | |
| `connector.binding` | 外部数据源订阅与同步 | | | | ● | |
| `package.instantiate` | 知识包实例化（可 fork 改写） | | | | ● | |
| `rebuild.controlled` | 受控重建 build-then-swap | | | | ● | |
| `governance.audit` | 审计接入 | | | | | ● |
| `evaluation.sets` | 评测集、质量基线与回归 | | | | | ● |
| `share.targeted` | 定向共享（grantee=user） | | | | | ● |
| `template.custom` | org 自建加工模板 | | | | | ● |

**其中五个键当前无实现**：`governance.audit` / `evaluation.sets` / `share.targeted` / `template.custom` / `package.instantiate`。它们仍进矩阵——键位先占住，套餐页可以如实标注"即将开放"，而不是等实现完再重排档位把已购用户的档位语义改掉。

## 6. 上限键（karda 出键，平台配值）

`withinCap` 在**上限缺省时 fail-closed**，所以**每一档都必须声明每一个键**，否则该能力静默拒绝。

| 键 | 计什么 | free | starter | pro | business | enterprise |
|---|---|--:|--:|--:|--:|--:|
| `kb.max` | 库数量 | 1 | 5 | 20 | 100 | −1 |
| `document.max` | 文档总数 | 100 | 2,000 | 20,000 | 200,000 | −1 |
| `storage.bytes` | 原始件存储 | 1 GiB | 20 GiB | 200 GiB | 2 TiB | −1 |
| `binding.max` | 连接器订阅数 | 0 | 0 | 0 | 20 | −1 |

`−1` = 无限。数值是**建议梯度，绝对值归 owner 定价**；重要的是相邻档之间的倍率能撑起升级动机，而不是具体数字。

## 7. 配额池（消耗型，必须命中已登记计量键）

karda 已在平台计量注册表登记三个键（`80-liaison/120` 段 C 已完成）：

| 计量键 | 类型 | 触发 | free | starter | pro | business | enterprise |
|---|---|---|--:|--:|--:|--:|--:|
| `karda.ingest` | per_doc | 每份成功入藏的文档 | 100 / 月 | 2,000 / 月 | 20,000 / 月 | 200,000 / 月 | 按合同 |
| `karda.search` | per_call | 每次 `karda.search` | 1,000 / 月 | 20,000 / 月 | 200,000 / 月 | 2,000,000 / 月 | 按合同 |
| `karda.ask` | per_call | 每次 `karda.ask` | 0 | 500 / 月 | 10,000 / 月 | 100,000 / 月 | 按合同 |

`karda.ask` 在 free 档为 0，与 §4 一致：生成是最贵的一次 Atlas 调用，也是最清晰的升级理由。

## 8. 本文做出的判断（供评审推翻）

1. **向量检索不进 free**（§4 第 1 条）——否则免费档替所有人付 Atlas 账。
2. **Agent 写入与验证治理同档开（pro）**——让 agent 能写却不能治理，是在制造污染，不是在省钱。
3. **连接器接入放到 business**——外部数据源是组织级行为，且 `binding.max` 在低档为 0 而非缺省，避免 fail-closed 表现为"莫名其妙不能用"。
4. **未实现的能力键照样进矩阵**——键位先定，套餐页标"即将开放"；等实现完再重排会改掉已购用户的档位语义。
5. **上限每档全声明，不留缺省**——`withinCap` 的 fail-closed 语义使缺省等于静默拒绝，那是最难排查的一类工单。

## 9. 落地顺序

1. owner 批复本文 → 记入 `20-decisions.md`（新 KD，D 组同批）；
2. karda 填 `entitlement/capability.ts` 的 `CAPABILITY_MATRIX` + 上限键常量 + 单测（每档的键集合、累积性、上限全声明）；
3. karda 发联络 issue 给平台线：请按本文发布五档 `features` / `limits` / `quota_pools`；
4. 平台发布后，karda 侧验证：订阅一个工作区 → `/api/entitlement` 返回非空档位 → 能力门禁按矩阵生效。

**KD-203（实例化/归档存储计量口径）不阻塞本文**：它决定 `storage.bytes` 怎么计（实例与 archived 算不算），不决定档位切分。可与本文并行落。

## 10. 联动登记

- `entitlement/capability.ts` 的 `CAPABILITY_MATRIX` 是本文的实现体，两者冲突以本文为准；
- 计量键与 `240-ops-read-models` §4.3 的供给账本同源，但用途不同：账本给我们看，配额池给平台计费；
- 10-product-definition §11 第 5/6/7 条的 tier 映射示例由本文取代。

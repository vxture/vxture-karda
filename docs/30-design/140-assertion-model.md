# 140 - 断言模型:Fact / Claim / Entity / Evidence

Status: 设计稿 v0.1(2026-08-26),待 owner 拍板 §11。实现属批次 15。

定位权威 `20-specs/30-agent-knowledge-blueprint.md`(KD-017);本文是它在对象模型
层的落地,与 `100-kb-model.md`(v1 模型)是**增量关系**,不推翻其中任何一条。

---

## 1. 为什么是现在

KD-017 把定位提升为「Vxture 面向 AI Agent 的共享知识基础设施」,并给了两条硬约束:

> **RAG 是机制不是边界,Chunk 是中间产物不是核心模型。**

v1 的核心对象是 KnowledgeBase → {Document → Chunk, Entry}。这是一套**载体模型**:
它回答「这份内容在哪、怎么切、怎么召回」,不回答「它**说了什么**」。对一个把知识
供给给 Agent 的平台,后者才是产品。

三条独立的线同时指向同一个缺口:

| 线 | 事实 |
|---|---|
| **产品自己的画布** | 加工管线的五阶段是 `理解 → 萃取 → 编织 → 验证 → 入藏`,管家提案里有「冲突裁决」(两份文档对同一件事说法不一致)。**UI 早就假设了断言层存在**,只有模型没跟上 |
| **下游** | yucer 把「据谁所说、何时、哪一版」列为外部知识进入其判断路径的硬条件(`#103` Q14)。行级溯源已完备,断言级是他们最终需要的 |
| **登记册** | 批次 15 是登记册里最大的一处设计-实现落差 |

---

## 2. 缺口的准确形状

v1 能回答的:

- 这段文字来自 `document#42` 的第 3 块 → **行级溯源**,已完备;
- 这份文档由谁上传、何时索引、验证状态如何 → **文档级治理**,已完备。

v1 **不能**回答的,而 Agent 每一次引用都需要:

1. 「单架次时长 25 分钟」这句话本身是什么对象?今天它只是 chunk 里的一段字节,
   没有 id,不能被引用、被验证、被推翻;
2. 这句话**是谁说的**——不是「谁上传了文件」,是文件里那个作出断言的主体
   (《作业手册 2026》的编制单位),以及**截至什么时候**成立;
3. 两份文档就同一件事给出不同数字时,系统凭什么知道它们在**谈同一件事**?

第 3 条是关键:冲突检测不是文本相似度问题,是**同一断言的两个版本**问题。没有
断言对象,「冲突裁决」这个已经画在管家提案里的功能没有可实现的定义。

---

## 3. 对象模型 v2

新增三个一等对象。Document / Entry / Chunk **不变**,Chunk 的地位按 KD-017 下调
为检索机制的中间产物。

```
KnowledgeBase
  ├── Folder
  ├── Document ──── Chunk ─────────► 检索机制(向量/词法)
  │      │                              ▲
  │      └── Span ◄──┐                  │ v1 检索单元,不变
  │                  │                  │
  ├── Entry ─────────┼──────────────────┘
  │                  │
  ├── Assertion ─────┘  Evidence:断言 → 它的依据(某个 Span,或另一条 Assertion)
  │      │
  │      └── AssertionMention ──► Entity
  │
  └── Entity(库内业务对象注册表)
```

### 3.1 Assertion —— 一条有溯源的陈述

蓝图列了 Fact / Claim / Event / Procedure / Rule 五种。它们**不是五张表**,是一张
表上的 `kind` 枚举:五者的字段需求一致(主语、陈述、时效、来源、置信),差别在语义
而非结构,分表会立刻带来五份重复的溯源与治理逻辑。

| kind | 是什么 | 例 |
|---|---|---|
| `fact` | 可核验的客观陈述 | 项目预算 = 380 万元 |
| `claim` | 来源作出的判断/结论 | 该方案在雨天不具备作业条件 |
| `event` | 带时间的发生 | 2026-03-14 完成验收 |
| `procedure` | 有序步骤 | 断路挂牌五步 |
| `rule` | 约束/规定 | 风速 > 10 m/s 禁飞 |

### 3.2 Evidence —— 断言与其依据之间的边

不是断言的一个字段,是**一条边**,因为一条断言可以有多个依据,一个依据可以支撑多
条断言,而且依据可以是**另一条断言**(推导链)。做成字段会在第一次遇到「两份文档
都支持这条」时就崩掉。

### 3.3 Entity 与 AssertionMention

Entity 是库内业务对象的注册表(「XX应急管理局」「XX无人机项目」)。断言通过
`AssertionMention` 提及实体——同样是边,同样因为多对多。

**Entity 不做跨库合并**:同名实体在两个库里是两个 Entity。跨库消歧是本体问题,
属 Ontos 平面(五平面分工:Atlas 想、Runos 做、Karda 知、Arda 存、Ontos 定义语义),
不属 karda。这条边界现在写下来,免得实体表长成一个半吊子本体库。

---

## 4. 断言级溯源:yucer 那三个问题

| 问题 | 承载 | 说明 |
|---|---|---|
| **据谁所说** | `assertion.asserted_by` | **不是**上传者,不是抽取模型。是来源中作出该断言的主体 |
| **何时** | `assertion.as_of` | 该断言的时效起点;`valid_until` 可空,表示未声明失效 |
| **哪一版** | `evidence.document_version` | 依据所在文档的版本;文档重建后旧版本的 evidence 仍可解析 |

三者必须**同时**回答,才算断言级溯源。只给出「来自 document#42」是行级,yucer 明确
说过那不够。

**抽取者与断言者是两回事**,必须分开落列,这是本节唯一容易做错的地方:

- `asserted_by` = 《作业手册 2026》的编制单位 —— **内容的权威**;
- `extracted_by` = 做抽取的模型/管家运行 —— **过程的责任**。

把两者混成一列,产品就会告诉 Agent「这句话是 karda 说的」。那是最坏的一种错误:
它把来源的权威悄悄换成了我们自己的。

---

## 5. 与检索的关系:本轮**只做溯源层**(owner 2026-08-26)

两条路都成立,本轮取前者:

| | 本轮采纳 | 登记为下一步 |
|---|---|---|
| | **溯源层** | **检索单元** |
| 检索走什么 | 仍是 chunk / entry,零改动 | 答案变断言形状,chunk 退为兜底 |
| 断言的作用 | 挂在结果上,供引用、溯源、冲突检测 | 直接被召回与排序 |
| yucer 的依赖 | 满足 | 满足 |
| 风险 | 无检索回归 | 需重做排序,且当前评测基线不覆盖 |

理由:yucer 的依赖是**溯源**不是检索;而检索是目前唯一跑通、且被评测集覆盖的链路,
不该在断言模型尚未经真实语料验证时先动它。断言层先跑起来、被验证过、冲突检测有
实际产出之后,再谈让它承担召回。

**这不是把难题往后推**——溯源层本身就要求抽取管线、实体注册、冲突检测全部落地,
那是批次 15 的主体工作量。推后的只有排序。

---

## 6. 与治理的关系

断言**复用**既有的 `verification_state` 三态机(`unverified` / `verified` / `stale`),
不发明第四套状态。理由:验证治理的定义是「人确认过这条内容可信」,对断言的适用性
比对文档更强——文档是一个容器,断言才是可被确认或推翻的最小单位。

由此带来一处必须现在想清楚的**口径问题**:

> 一份文档已验证,从它抽取出的断言是否自动继承 `verified`?

**否。** 继承会让「验证」这个词失去意义:人验证的是文档,不是模型从中抽出的每一
句话——抽取本身可能出错,而这正是验证要拦的东西。断言默认 `unverified`,
经管家预验后进「待你确认」,人确认才是 `verified`。

这与 KD-208(覆盖率分母不排除未开治理的库)一致:分母只会变大,覆盖率会因为断言
的引入而**下降**,那是真实情况——那些断言确实没被验证过。**不为了让数字好看而改
口径**,这条已有裁定,此处只是它的延伸。

---

## 7. 与 KD-206(全域回收)的关系

KD-206 裁定客户删除请求触发**全域回收**。断言引入后,回收必须穿透到断言层:

- 删除一份 Document → 由它抽取的 Assertion 必须一并回收,否则「删掉了文件,但它说
  过的话还在被引用」;
- Evidence 是边,随两端任一端回收;
- Entity 若失去全部提及,**不自动删除**——实体注册表是库级资产,可能被后续内容重新
  提及。留空实体不构成数据残留(它不含来源内容)。

登记册里 KD-206 的未答子问题(回收是否穿透副本)在断言层有同样的形态,**一并在
§11 提请裁定**。

---

## 8. Knowledge API 扩面

关键发现:**现有引用 id 已经是把手**。`karda.ask` 返回的 `citations: [{ id, kbId }]`
中的 `id` 就是检索单元 id,新工具拿它往上走即可,**现有契约零改动**。

| 工具 | 入参 | 出参 | 依赖 |
|---|---|---|---|
| `karda.get_evidence` | 引用 id | 该引用支撑的断言 + 每条断言的 `asserted_by` / `as_of` / 文档版本 | Assertion + Evidence |
| `karda.find_entity` | 实体名/别名 + 范围 | 匹配的 Entity + 提及它的断言 | Entity + Mention |
| `karda.get_context` | 引用 id | 该引用在原文中的上下文跨度 | Span(不依赖断言,可先行) |
| `karda.browse` | 库 + 过滤 | 库内断言/实体的分页浏览 | 全部 |
| `karda.retrieve` | —— | 检索单元化之后才有意义 | **不在本轮** |

`get_context` 只依赖 Span,不依赖断言层,**可以先行交付**——它是四个工具里最便宜
且立刻有用的一个。

---

## 9. Schema 草案

遵守 `210-data-model` 的既有约束:DDL 三段式 + 列锁 + db-init 为唯一结构变更路径;
增量号接 `incr/0006_*`。以下为形状,列锁清单随实现补齐。

```
karda_kb.assertion
  id              UUID PK
  kb_id           UUID NOT NULL  → knowledge_base (CASCADE)
  kind            VARCHAR(32)    CHECK IN ('fact','claim','event','procedure','rule')
  subject         VARCHAR(512)   -- 断言的主语,用于聚类与冲突候选
  statement       TEXT NOT NULL  -- 陈述本体
  asserted_by     VARCHAR(512)   -- 据谁所说(来源主体,非上传者)
  as_of           TIMESTAMPTZ    -- 何时起成立
  valid_until     TIMESTAMPTZ    -- 可空 = 未声明失效
  extracted_by    VARCHAR(128)   -- 过程责任:模型/管家运行,与 asserted_by 严格分开
  extraction_run  UUID           -- 可回溯到具体一次加工
  confidence      NUMERIC(4,3)   -- 抽取置信,人确认后不再参与排序
  content_state       VARCHAR(32)  -- 复用 §5.1 内容主状态机
  verification_state  VARCHAR(32)  -- 复用 §5.2 治理状态机
  verifier / verified_at / expires_at
  superseded_by   UUID           -- 冲突裁决的结果:被哪条断言取代
  created_at / updated_at

karda_kb.span
  id              UUID PK
  document_id     UUID NOT NULL  → document (CASCADE)
  document_version INTEGER NOT NULL   -- 「哪一版」
  start_offset / end_offset  INTEGER
  excerpt         TEXT           -- 冗余存一份,重建后仍可展示

karda_kb.evidence
  id              UUID PK
  assertion_id    UUID NOT NULL  → assertion (CASCADE)
  span_id         UUID           → span (CASCADE)      -- 二者之一非空
  supports_id     UUID           → assertion (CASCADE) -- 推导链
  stance          VARCHAR(16)    CHECK IN ('supports','contradicts')

karda_kb.entity
  id / kb_id / name / kind / aliases JSONB / created_at

karda_kb.assertion_mention
  assertion_id / entity_id / role VARCHAR(32)
```

`stance` 上的 `contradicts` 是冲突检测的落点:两条断言各自有支持证据、且互相
`contradicts`,就是一次管家提案的输入。

---

## 10. 明确不做(本轮)

跨库实体消歧(属 Ontos);断言的自动推理/演绎;断言作为检索单元(§5);断言的
多人协作编辑(与 v1 的内容生产哲学一致——接入而非编辑器);`karda.retrieve`。

---

## 11. 待拍板

| # | 决策项 | 倾向建议 | 影响 |
|---|---|---|---|
| 1 | 断言是否继承文档的 `verified` | **不继承**(§6) | 覆盖率会下降,需与 KD-208 一起对外解释 |
| 2 | 抽取在管线哪一段落地 | 萃取阶段产出,编织阶段做冲突候选 | 决定 `processing_task_stage` 是否加档 |
| 3 | `confidence` 是否进检索排序 | 人确认前参与,确认后不再参与 | 影响 120-retrieval-tools |
| 4 | KD-206 回收是否穿透副本(实例/快照) | 登记册未答子问题,在断言层同形 | 与 KD-204(archived 不自动清除)措辞相触 |
| 5 | 一条断言能否跨库 | **否**,kb_id 非空 | 跨库共享走发布,不走断言复用 |

---

## 12. 联动修订登记

- `100-kb-model.md`:§2.1 对象总图需增列本文三对象,Chunk 地位下调注明 KD-017;
- `110-processing`:抽取落在哪一段(§11 #2)决定其阶段清单是否变化;
- `120-retrieval-tools`:本轮不改;`confidence` 若入排序(§11 #3)则改;
- `210-data-model`:`incr/0006_*` 与 Prisma 同步,受 `check-data-architecture` 硬门;
- `20-decisions.md`:§11 拍板后逐条登记 KD 号。

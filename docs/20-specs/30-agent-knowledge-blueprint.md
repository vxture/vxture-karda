# Karda 知识平台：产品定义与概要设计

> 版本:v1.0(owner 蓝图,2026-08-18)
> 状态:**定位权威** — 本文是 karda 产品定位与概要设计的最高产品级依据(冲突序:平台约束 > 本文(定位与方向)> `10-product-definition`(现行结构与已定决策)> `30-design/` 子文档)
> 出处:owner 手稿《Karda 知识平台:产品定义与概要设计》原文收编,仅加本头与空白规范化(去行尾空格);正文未改动
> 落账:KD-017(`20-decisions.md`);现行实现与本蓝图的词汇映射见 `10-product-definition.md` §1.1


## 1. 产品定位

### 1.1 产品定义

**Karda 是 Vxture 面向 AI Agent 的共享知识基础设施。**

Karda 负责从多源数据中构建、管理、组织和持续沉淀知识资产，并向 Agent 提供统一的知识检索、获取和上下文服务。

Karda 的核心目标不是建设传统意义上的“文档知识库”，也不是单纯建设 Vector Database 或 RAG 服务，而是：

> **让多个 Agent 能够共享、复用和持续积累企业知识，并在任务执行过程中获得与业务场景相关的可靠知识上下文。**

---

## 2. 在 Vxture AI 体系中的位置

Vxture 的核心平台形成以下关系：

```text
                           ┌─────────────────────┐
                           │        Agent        │
                           │                     │
                           │  Task / Planning    │
                           │  Reasoning / Orchestration
                           └─────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
                 Atlas             Runos           Karda
                Model              Ability        Knowledge
             「思考能力」          「执行能力」       「知识」
                    │                │                │
                    │                │                │
                    └────────┬───────┘                │
                             │                        │
                         Agent执行                    │
                                                      │
                                     ┌────────────────┘
                                     │
                                     ▼
                                   Arda
                                   Data
                                  「数据」
                                     │
                                     │
                                     ▼
                              Business Systems
                              「业务事实/实时数据」

                    Ontos
                 「业务语义」
                     │
                     └────→ Agent / Atlas / Karda
```

### 核心关系

| 平台 | 核心职责 | Agent 如何使用 |
|---|---|---|
| **Atlas** | 模型、推理、生成 | Agent 的思考与生成能力 |
| **Runos** | 能力、工具、执行资源 | Agent 的行动与外部系统操作 |
| **Karda** | 共享知识资产与知识获取 | Agent 获取背景知识、历史知识、文档、事实、证据 |
| **Arda** | 数据平台、共享数据服务 | Agent 获取结构化业务数据、数据服务 |
| **Ontos** | 本体与业务语义 | Agent / Atlas 理解业务对象、关系、语义上下文 |

因此，不应理解成：

```text
Arda → Karda → Ontos → Atlas → Runos → Agent
```

而应该理解成：

```text
                         Agent
                           │
              ┌────────────┼────────────┐
              │            │            │
            Atlas         Runos        Knowledge/Data
          思考/生成       执行/调用       │
                                      ┌───┴───┐
                                    Karda   Arda
                                    知识     数据
                                      │
                                      │
                                    Ontos
                                   业务语义
```

Agent 根据具体任务自主组合这些基础能力。

---

# 3. Agent 的核心运行逻辑

Agent 的核心是：

> **Atlas + Runos**

即：

```text
Atlas
  ↓
Think / Reason / Plan
  ↓
Runos
  ↓
Execute / Query / Operate
```

但是 Agent 在思考和执行过程中，需要不断补充上下文：

```text
                     Agent
                       │
                ┌──────┴──────┐
                │             │
             Thinking      Acting
                │             │
              Atlas         Runos
                │             │
         ┌──────┼─────────────┼──────┐
         │      │             │      │
       Karda   Arda         Business Systems
       知识     数据             业务数据
         │
       Ontos
       语义
```

例如“销售分析 Agent”：

```text
用户：
分析客户 A 当前销售机会及风险
             │
             ▼
           Agent
             │
       ┌─────┴─────┐
       ▼           ▼
     Karda       Runos
   历史知识       CRM查询
       │           │
       │           ▼
       │          实时业务数据
       │
       ▼
     客户历史项目、
     行业信息、
     沟通知识、
     产品知识
       │
       └─────┬─────┘
             ▼
           Atlas
        综合分析/推理
             │
             ▼
           Agent
             │
             ▼
          分析结果
```

如果需要理解：

> “客户”“项目”“销售机会”“合同”之间是什么关系？

Agent / Atlas 可以进一步调用 Ontos 获取对应业务语义。

---

# 4. Karda 的核心价值

Karda 解决的不是：

> “如何把 PDF 转成 Embedding？”

而是三个更大的问题。

### 4.1 企业知识资产化

把分散在不同地方的信息变成统一管理的知识资产。

### 4.2 Agent 之间的知识共享

不同 Agent 不再各自建设独立知识库。

```text
                    Karda
              Shared Knowledge
                     │
        ┌────────────┼────────────┐
        │            │            │
     销售Agent      标书Agent     客服Agent
        │            │            │
        └────────────┼────────────┘
                     │
                  共享知识
```

### 4.3 Agent 工作过程中持续沉淀知识

知识不只是“人工上传”。

Agent 可以：

```text
读取知识
   ↓
执行任务
   ↓
产生新事实 / 新结论
   ↓
经过规则或业务系统确认
   ↓
沉淀到 Karda
```

因此 Karda 是一个：

> **持续演化的 Agent Shared Knowledge Layer**

---

# 5. Karda 的核心能力边界

Karda 第一阶段建议围绕六个核心能力建设。

```text
Karda
│
├── 1. Knowledge Source
│
├── 2. Knowledge Processing
│
├── 3. Knowledge Asset
│
├── 4. Knowledge Organization
│
├── 5. Knowledge Retrieval
│
└── 6. Knowledge Service
```

---

# 6. Knowledge Source —— 知识接入

Karda 自己就是知识接入平台。

Arda 只是其中一个来源。

### 来源类型

```text
Knowledge Sources
│
├── File
│   ├── PDF
│   ├── Word
│   ├── Excel
│   ├── PPT
│   └── Images
│
├── Web
│   ├── URL
│   ├── Website
│   └── Web Crawl
│
├── External Systems
│   ├── SaaS
│   ├── API
│   ├── Email
│   └── Business Systems
│
├── Data Platform
│   └── Arda
│
└── Agent
    └── Agent-generated Knowledge
```

Karda 负责把这些来源转化为 Knowledge Source，并建立来源、更新时间、权限、版本和可信度等信息。

### 边界

Karda 不负责成为企业统一原始数据平台。

尤其：

> **业务系统中的业务数据仍然由业务系统负责存储和维护。**

Arda 则负责共享数据服务和数据资产能力。

---

# 7. Knowledge Processing —— 知识加工

接入原始数据之后，Karda负责将其转换为 AI 可使用的知识。

```text
Source
  ↓
Parse
  ↓
Structure
  ↓
Understand
  ↓
Contextualize
  ↓
Extract
  ↓
Knowledge Units
```

主要能力包括：

- 文档解析
- OCR
- Layout Analysis
- 表格解析
- 文档结构识别
- Chunking
- Contextual Retrieval / Contextualization
- Metadata Extraction
- Entity Extraction
- Relation Extraction
- Fact / Claim Extraction
- Summary
- Embedding
- Indexing

这里需要特别强调：

> **Chunk 只是知识加工过程中的一个中间产物，不是 Karda 的核心知识模型。**

---

# 8. Knowledge Asset —— 知识资产

Karda最终管理的是知识资产，而不是单纯的 Chunk。

建议核心对象包括：

```text
Knowledge Asset
│
├── Document
├── Section
├── Table
├── Image
├── Chunk
├── Fact
├── Claim
├── Entity
├── Event
├── Procedure
├── Rule
└── Evidence
```

其中：

### Document

原始知识载体。

### Fact

明确事实。

例如：

```text
项目预算 = 380万元
```

### Claim

来源中的判断、声明或结论。

### Entity

业务对象实例。

例如：

```text
XX应急管理局
XX无人机项目
```

### Evidence

支撑某个知识或结论的原始依据。

这对于 Agent 的引用、可信度和可追溯性非常重要。

---

# 9. Knowledge Organization —— 知识组织

Karda 中应该存在大量 Knowledge Base / Knowledge Collection。

但不建议简单做成传统文件夹树。

建议采用：

```text
Knowledge Space
       │
       ├── Knowledge Collection
       │        │
       │        ├── Documents
       │        ├── Facts
       │        ├── Entities
       │        └── Evidence
       │
       └── Metadata / Classification
```

例如：

```text
企业知识空间
│
├── 产品知识
├── 销售知识
├── 行业知识
├── 客户知识
├── 项目知识
├── 标书知识
└── 技术知识
```

同一知识资产可以通过 Metadata、Tag、Entity、Relation 等方式被不同场景复用，而不必复制多份。

---

# 10. Knowledge Retrieval —— 知识检索与获取

Karda 提供 Agent 所需的知识获取能力。

但这里不应把 Retrieval 简化成 RAG。

建议形成：

```text
Knowledge Retrieval
│
├── Keyword Search
├── Semantic Search
├── Hybrid Search
├── Metadata Filter
├── Entity Search
├── Document Navigation
├── Graph / Relation Retrieval
├── Reranking
└── Agentic Retrieval
```

底层索引可以包括：

```text
Vector Index
Full-text Index
Metadata Index
Graph Index
Structured Index
```

因此：

> **RAG 是 Karda 的一种 Retrieval / Context Assembly 机制，而不是 Karda 的产品边界。**

未来即使 Agent 主要采用 Agentic Retrieval、Graph Retrieval 或结构化查询，Karda 的定位也不需要改变。

---

# 11. Knowledge Service —— 面向 Agent 的知识服务

Karda最终不是只给管理员使用。

它必须提供标准化的 Agent-facing API / Resource。

例如：

```text
Knowledge API
│
├── search()
├── retrieve()
├── get()
├── browse()
├── find_entity()
├── get_evidence()
├── get_context()
└── write_knowledge()
```

Agent 可以：

```text
Agent
 │
 ├── Karda.search()
 ├── Karda.retrieve()
 ├── Karda.get_context()
 └── Karda.write_knowledge()
```

这些能力可以：

1. Agent Runtime 直接调用 Karda；
2. 通过 Runos Resource 暴露给 Agent。

二者底层仍然是同一个 Karda Knowledge Service。

---

# 12. Karda 与 Runos 的关系

这里需要明确区分：

### Karda

提供：

> **Knowledge Resource**

例如：

```text
Search Product Knowledge
Search Customer Knowledge
Retrieve Project Knowledge
Get Evidence
```

### Runos

提供：

> **Ability / Execution Resource**

例如：

```text
Query CRM
Query Database
Send Email
Create Order
Generate Report
Call External API
```

因此：

```text
Agent
 │
 ├─────────────── Knowledge ──────────────→ Karda
 │
 └─────────────── Ability / Action ───────→ Runos
```

Runos 可以把 Karda 的知识能力包装为 Resource，但：

> **Karda 本身仍然是知识能力的所有者。**

这样避免 Karda 被 Runos 吞掉，也避免 Runos成为另一个知识平台。

---

# 13. Karda 与 Arda 的关系

这是另外一个必须明确的边界。

### Arda

定位：

> **企业共享数据平台 / 数据服务平台**

负责：

- 数据接入
- 数据资产
- 数据治理
- 数据存储
- 数据服务
- 数据 API
- 结构化数据访问

### Karda

定位：

> **企业共享知识平台**

负责：

- 非结构化数据
- 知识加工
- 知识资产
- 语义化知识
- 知识索引
- 知识检索
- Agent 知识沉淀

因此：

```text
Business System
      │
      ├──────────────→ Arda
      │                 │
      │              Data Service
      │
      └──────────────→ Karda
                        │
                   Knowledge
```

但需要特别强调：

> **Karda 不应该直接成为业务数据的最终主存储。**

例如 CRM 的客户金额：

```text
CRM
 ↓
客户金额 = 1000万
```

这是业务系统的事实。

Agent 可以通过 Runos / Arda 查询它。

Karda 可以保存：

> “客户近期合同规模持续增长，存在扩大采购可能。”

这是知识。

---

# 14. 业务系统如何反向更新 Karda

这是 Karda 非常重要的一条数据流。

```text
Business System
      │
      │ 业务事实 / 文档 / 事件
      ▼
    Karda
      │
      ▼
Knowledge Asset
```

例如 CRM 中发生：

```text
客户A签订合同
```

业务系统仍然保存：

```text
Contract
Amount
Date
Customer
```

Karda 可以同步或接收：

```text
客户A已签订XX项目
客户当前进入交付阶段
客户关注XX产品
```

形成 Agent 可理解和检索的知识。

因此：

> **业务系统是业务事实的 Source of Truth。**

> **Karda 是知识资产的 Source of Truth。**

这两个概念必须分开。

---

# 15. Agent 向 Karda 沉淀知识

Karda还应该支持 Agent 产生知识。

但不能简单理解成：

> Agent说一句话 → 直接永久写入知识库。

建议至少区分：

```text
Agent Generated Knowledge
        │
        ├── Observation
        ├── Fact
        ├── Conclusion
        ├── Summary
        └── Recommendation
```

再根据业务规则：

```text
Draft
 ↓
Review / Verify
 ↓
Published Knowledge
```

这样可以避免 Agent 的一次错误推理污染企业共享知识。

---

# 16. Karda 的核心数据模型

第一阶段建议围绕以下对象建立：

```text
Knowledge Space
      │
      ├── Collection
      │
      ├── Source
      │
      ├── Knowledge Asset
      │      ├── Document
      │      ├── Fact
      │      ├── Entity
      │      ├── Event
      │      ├── Claim
      │      └── Evidence
      │
      ├── Index
      │
      └── Retrieval
```

其中：

```text
Source
  ↓
Knowledge Asset
  ↓
Index
  ↓
Retrieval
  ↓
Context
  ↓
Agent
```

是 Karda 最核心的生命周期。

---

# 17. Karda 与 Ontos 的关系

这是五个平台关系中最需要精确处理的一点。

Ontos 不负责保存 Karda 的所有知识。

Ontos负责：

> **定义业务世界的语义模型。**

例如 Ontos 定义：

```text
Customer
Project
Contract
Product
Organization
Person
Location
```

以及：

```text
Customer ──owns──> Project
Project ──has──> Contract
Contract ──contains──> Product
```

Karda则保存实际知识：

```text
Customer:
  XX集团

Project:
  XX集团智慧应急项目

Contract:
  2026年度项目合同
```

因此：

> **Ontos 定义“是什么”，Karda 保存“知道了什么”。**

Karda 可以调用 Ontos 获取语义定义，从而让知识加工和检索更加业务化。

Agent / Atlas 也可以直接调用 Ontos，获得与当前任务相关的业务语义。

---

# 18. 最终的五个平台关系

最终建议采用这个模型，而不是线性架构：

```text
                              ┌───────────────┐
                              │     Agent     │
                              │               │
                              │ Task          │
                              │ Planning      │
                              │ Orchestration │
                              └───────┬───────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
                    ▼                 ▼                  ▼
                 Atlas              Runos              Karda
                 Model             Ability           Knowledge
              思考 / 生成         执行 / 操作        知识 / 上下文
                    │                 │                  │
                    │                 │                  │
                    │          ┌──────┴──────┐           │
                    │          │             │           │
                    │        Arda        Business       │
                    │        Data         Systems        │
                    │          │             │           │
                    │          └─────────────┘           │
                    │                                    │
                    └────────────────┬───────────────────┘
                                     │
                                   Ontos
                                Business Semantics
```

但这个图需要理解成**能力关系图**，不是调用顺序。

实际运行时可能是：

```text
Agent
 │
 ├── Atlas → 思考
 │
 ├── Karda → 获取知识
 │
 ├── Arda → 获取数据
 │
 ├── Ontos → 获取业务语义
 │
 ├── Runos → 执行能力
 │
 └── Atlas → 综合推理
```

而且可以循环：

```text
Think
 ↓
Retrieve Knowledge
 ↓
Query Data
 ↓
Understand Semantics
 ↓
Think
 ↓
Execute
 ↓
Observe
 ↓
Think
```

---

# 19. Karda 的产品边界

最终可以用下面这张表作为产品团队的边界原则：

| 能力 | Karda | Arda | Ontos | Atlas | Runos |
|---|:---:|:---:|:---:|:---:|:---:|
| 文件/网页知识接入 | **●** | ○ | - | - | - |
| 非结构化数据管理 | **●** | - | - | - | - |
| 文档解析 | **●** | - | - | ○ | - |
| Chunk / Context | **●** | - | - | ○ | - |
| Embedding / Index | **●** | - | - | - | - |
| 知识资产 | **●** | - | ○ | - | - |
| Knowledge Retrieval | **●** | - | ○ | - | ○ |
| RAG / Context | **●** | - | ○ | ○ | - |
| 企业结构化数据 | - | **●** | - | - | ○ |
| 数据查询服务 | - | **●** | - | - | **●** |
| 业务语义模型 | ○ | - | **●** | ○ | - |
| 模型推理 | - | - | ○ | **●** | - |
| 工具 / 能力执行 | - | - | - | - | **●** |
| Agent 知识沉淀 | **●** | - | ○ | - | ○ |
| 业务数据最终存储 | - | **●/业务系统** | - | - | - |

`● = 核心职责`
`○ = 可以协作 / 使用，但不是职责归属`

---

# 20. Karda 第一阶段产品范围

基于你现在正在做两个示例 Agent，我建议 Karda 第一阶段不要过度扩张。

```text
Karda v1
│
├── Knowledge Spaces
│
├── Knowledge Collections
│
├── Sources
│   ├── Upload
│   ├── URL
│   ├── Web Crawl
│   ├── Arda
│   └── External Connector
│
├── Knowledge Processing
│   ├── Parse
│   ├── OCR
│   ├── Structure
│   ├── Chunk
│   ├── Context
│   └── Embedding
│
├── Knowledge Assets
│   ├── Documents
│   ├── Facts
│   ├── Entities
│   └── Evidence
│
├── Index
│   ├── Vector
│   ├── Full-text
│   └── Metadata
│
├── Retrieval
│   ├── Semantic
│   ├── Keyword
│   ├── Hybrid
│   └── Rerank
│
├── Knowledge API
│   ├── Search
│   ├── Retrieve
│   ├── Context
│   ├── Evidence
│   └── Write
│
└── Knowledge Governance
    ├── Permission
    ├── Version
    ├── Source
    ├── Owner
    └── Verification
```

GraphRAG、复杂 Knowledge Graph、Agentic Retrieval 等可以作为后续能力演进，而不是 v1 的产品边界。

---

# 21. 最终产品定义

**Karda = Vxture Agent Knowledge Platform**

> Karda 是 Vxture 面向 AI Agent 构建的共享知识平台。它接入文件、网络、业务系统、Arda 以及 Agent 产生的多源信息，将其加工为可管理、可检索、可引用、可持续沉淀的知识资产，并通过统一 Knowledge Service 为多个 Agent 提供共享的知识与上下文。

其核心不是：

> **Vector DB + RAG**

而是：

> **Multi-source → Knowledge → Index → Retrieval → Context → Agent**

同时形成：

> **Agent → Karda → Shared Knowledge → Agent**

的知识沉淀与复用闭环。

而整个 Vxture Agent 基础设施的职责关系则是：

> **Atlas 负责思考，Runos 负责行动，Karda 提供知识，Arda 提供数据，Ontos 提供业务语义，Agent 将它们组合起来完成业务任务。**
# Karda 产品定位与设计思路(Product Definition)

> 版本:v0.5
> 状态:Draft — 迭代基线
> 上游文档:**30-agent-knowledge-blueprint(owner 蓝图,定位权威)**、product_100_matrix、product_110_sharing-isolation(含用户维度增补 v2)、product_200_integration、product_210_tool-protocol v1.0
> 约束基线:product_110 已固化项与 product_210 协议规范对本文档具有约束力;**定位与方向以 30-blueprint 为准**
>
> **v0.5 变更摘要**(相对 v0.4)— **定位提升**(owner 2026-08-18,KD-017):
> 1. 定位陈述由"企业知识能力域(被 agent 关联使用的 L2 平台)"提升为 **Vxture 面向 AI Agent 的共享知识基础设施**——五平台之一(Atlas 思考 / Runos 行动 / Karda 知识 / Arda 数据 / Ontos 语义),owner 蓝图收编为 `30-agent-knowledge-blueprint.md` 并成为定位权威;
> 2. 产品边界重述:**RAG 是 Karda 的一种检索/上下文机制,不是产品边界;Chunk 是加工中间产物,不是核心知识模型**——核心主线是 Multi-source → Knowledge → Index → Retrieval → Context → Agent,及 Agent → Karda → Shared Knowledge → Agent 沉淀闭环;
> 3. 新增 §1.1 蓝图↔现行实现词汇映射(已建 / 承载中 / 路线三态,不推翻任何已裁 KD);
> 4. 演进路线(§9)对齐蓝图:知识资产模型(Fact/Claim/Entity/Event/Evidence)、Knowledge API 扩面(retrieve/get_context/get_evidence/find_entity/browse)、Contextualization、Agentic/Graph Retrieval 入 v2/v3;
> 5. 通道事实更新:Knowledge Service 双通道(直连 S2S + Runos MCP,`230-runos-channel`),Runos 通道含 service 模式写入(落 processing/draft,蓝图 §15 的沉淀阶梯)。

---

## 1. 定位陈述

**Karda — Vxture 面向 AI Agent 的共享知识基础设施(Vxture Agent Knowledge Platform)。**

> Karda 从多源(文件 / 网络 / 业务系统 / Arda / Agent)构建、管理、组织并持续沉淀企业知识资产,
> 经统一 Knowledge Service 为多个 Agent 提供共享知识、检索与任务上下文。它与 Atlas(思考)、
> Runos(行动)、Arda(数据)、Ontos(语义)并列,是 Vxture Agent 基础设施的五平台之一。
> (定位权威与完整论证:`30-agent-knowledge-blueprint.md`)

三条核心价值(蓝图 §4):

1. **企业知识资产化**——分散信息变成统一管理的知识资产;
2. **Agent 之间的知识共享**——不同 Agent 不再各自建设独立知识库;
3. **Agent 工作过程中持续沉淀知识**——读取 → 执行 → 产生 → 确认 → 沉淀的闭环,Karda 是持续演化的 Agent Shared Knowledge Layer。

三条边界原则(蓝图 §10/§13):

- **RAG 是机制不是边界**:RAG 只是 Karda 的一种 Retrieval / Context Assembly 机制;将来 Agent 主用 Agentic / Graph / 结构化检索,定位不变;
- **Chunk 是中间产物**:Karda 管理的是知识资产(Document/Fact/Claim/Entity/Event/Evidence…),不是 Chunk;
- **两个 Source of Truth**:业务事实真值在业务系统(经 Runos/Arda 查询),知识资产真值在 Karda——Karda 不做业务数据的最终主存储。

结构与治理原则(承接 v0.4,继续有效——定位提升不改变这些已裁结构):

1. **不主张"平台拉通"**:知识由属主创建、发布由属主意愿 + 管理员执行逐级公开、使用由关联/指名决定;
2. **全量托管,授权即隔离**:托管水位线为全量;知识边界由授权逻辑 + 索引命名空间成立,无物理分库兜底;
3. **库跟人走,产品零绑定**:U 级库治理锚定 home WS、使用随属主跨 WS;产品与库之间只有"关联使用"关系;
4. **L2 统一原型实例**:能力层 + P-T-U 资产层 + 授权层;Knowledge Service 双通道暴露——L0 工具协议直连(product_210)+ Runos 能力面(`230-runos-channel`),两通道同一服务。

**仓库描述(英文,同步 product_100)**:
Vxture Agent Knowledge Platform — the shared knowledge infrastructure for AI agents: builds, manages, and continuously accumulates enterprise knowledge assets from many sources, and serves shared knowledge, retrieval, and task context to every agent through one Knowledge Service.

### 1.1 蓝图 ↔ 现行实现词汇映射(定位提升不推翻已建之物)

三态:**已建**(代码在产)/ **承载中**(蓝图概念由现有结构承载,暂不新建对象)/ **路线**(蓝图方向,入 §9 演进)。

| 蓝图概念(30-blueprint) | 现行实现 | 状态 |
|---|---|---|
| Knowledge Space | org / workspace 维度 + P-T-U 资产分层 | 承载中(v2 复议是否显式化为对象) |
| Knowledge Collection | `knowledge_base`(库,单一类型 + 双模板)+ Folder | 已建 |
| Source:File / Arda / Agent | 上传;connector 框架(`220`)+ arda 通道(`200`);工具面与 Runos 通道写入 | 已建 |
| Source:Web / External Systems | — | 路线(v2,connector 框架的新连接器) |
| Processing:Parse/Chunk/Embedding | 五段管线 fetch/parse/chunk/embed/commit;向量化经 Atlas A1(2026-08-18 live-ready) | 已建 |
| Processing:OCR / Layout / 表格(深解析) | Atlas A2 已上线,karda 深解析路径尚未接线 | 路线(近期) |
| Processing:Contextualization / Entity·Fact 抽取 | — | 路线(v2,Fact/Entity 资产的前置) |
| Asset:Document | `document`(内容态 + 治理态双状态机) | 已建 |
| Asset:结构化条目(Procedure/Rule 的卡片化承载) | `entry` + ContentTemplate(FAQ/术语/SOP) | 已建 |
| Asset:Fact / Claim / Entity / Event / Evidence | — | 路线(v2 起;依赖抽取管线 + Ontos schema;yucer #103 Q14 的断言级溯源在此闭合) |
| Chunk(中间产物) | `chunk` + `chunk_embedding`(ADR-002) | 已建(按蓝图定性:非核心模型) |
| Index:Vector / Full-text / Metadata | `chunk_embedding` + BM25 + filterable 白名单 | 已建 |
| Index:Graph / Structured | — | 路线(v2/v3,图谱归属待 KD-205) |
| Retrieval:Hybrid / Rerank | RRF 双路 + Atlas A3 统一精排 + verification_filter | 已建 |
| Retrieval:Entity / Graph / Agentic / Navigation | — | 路线(v2/v3) |
| Knowledge API:search / write_knowledge | `karda.search` / `karda.ask`;`write_document` / `create_entry` | 已建(双通道) |
| Knowledge API:retrieve / get / browse / find_entity / get_evidence / get_context | — | 路线(v2 扩面;get_evidence 依赖 Evidence 资产) |
| Agent 沉淀阶梯(蓝图 §15:Draft → Review/Verify → Published) | 写入落 processing/draft → 索引 → 验证治理(unverified/verified/stale)+ 发布阶梯 | 已建(即现行治理域) |
| 经 Runos 暴露的 Knowledge Resource(蓝图 §12) | `karda.kb-read` / `karda.kb-write`(`230-runos-channel`,MCP 端点) | 已建(Runos 侧注册进行中) |

---

## 2. 文档族谱(Karda 设计文档索引)

| 路径 | 范围 | 状态 |
|---|---|---|
| `docs/20-specs/30-agent-knowledge-blueprint` | **定位权威**:owner 蓝图——五平台关系、六能力域、知识资产模型、边界表、第一阶段范围 | v1.0(2026-08-18) |
| `docs/20-specs/10-product-definition`(本文) | 定位落地、结构、已定决策、v1 范围、产品级待拍板 | v0.5 |
| `docs/30-design/100-kb-model` | 对象模型、双模板、层级、元数据、生命周期、库级配置面 | v0.1 |
| `docs/30-design/110-processing` | 解析管线、分块参数化、增量与重建、失败重试工程 | v0.1 |
| `docs/30-design/120-retrieval-tools` | 检索求值链、联合召回、可见集缓存、关联表达、工具面 | v0.1 |
| `docs/30-design/200-arda-channel` | Karda×Arda 内容通道契约(跨产品评审草案) | v0.1 |

> 编号即引用键(本仓文档约定 `docs/00-meta/10-docs-convention.md` §3):正文互引写编号或
> `NNN-slug`,改 slug 不打断引用。`product_NNN` 前缀的引用指向 **platform 仓**文档,不在本仓。

冲突裁决序:product_110/210(平台约束)> **30-blueprint(定位与方向)** > 本文(产品决策)> 子文档(设计细节);子文档间冲突以本文登记的决策为准。定位提升(KD-017)不推翻既有 KD 裁定——结构冲突逐条经决策登记收口,不默改。

---

## 3. 产品结构总览

```
Karda
├── 能力层(Knowledge Engine)——按 product_210 协议直连暴露,entitlement 控可用性
│   ├── 加工域:摄取(上传/API/Arda 通道) / 解析 / 分块 / 向量化 / 增量更新 / 包实例化;图谱抽取预留
│   ├── 检索域:混合检索(RRF 双路融合) / 统一精排 / 跨库跨命名空间联合召回 / 引用溯源
│   ├── 应答域:带引用知识问答(单轮)
│   └── 治理域:验证与时效(选配) / 质量档位 / 检索质量评估 / 血缘与审计
│
├── 资产层(Knowledge Bases)——P-T-U 三级 + product 预置(边界情形)
│   ├── 库为唯一类型;库内容纳 Document(文件型)与 Entry(条目型)两类内容单元
│   ├── 双模板:ProcessingTemplate(库级,解析/分块行为)/ ContentTemplate(条目级,字段结构)
│   ├── P:平台知识包(双消费模式:live 只读订阅 / snapshot 实例化落 T 级)
│   ├── T:org 知识库(org/WS 管理员建设;含 P 实例化落地库,origin_ref 溯源)
│   ├── U:用户知识库(键 (org, home_ws, user);发布阶梯;治理锚定 home WS,使用跟人走)
│   └── product 预置库(agent 出厂语料,agent 逻辑自用,不进关联清单)
│
├── 消费模型——关联清单(attachment,user × product,服务端状态):未关联默认不检索
│
└── 授权层——消费 C2 可见集(四元组键),召回白名单 = 关联 ∩ 可见 ∧ entitlement,召回层强制过滤
```

总原则:**能力无状态、资产有归属、使用靠关联**。

---

## 4. 资产层:已定决策摘要(细节见 100-kb-model)

1. **单一库类型 + 双模板分化**(行业收敛:Dify/RAGFlow/FastGPT 单库配置化 + Guru/SharePoint 模板化):FAQ/术语等需求 = 加工模板选 Q&A 式 + ContentTemplate 定字段,零新库类型;
2. **两类内容单元**:Document(外来文件托管,内容不可改、真值在源)/ Entry(原生结构化条目,字段级可编辑、库内即真值);
3. **浅层级、权限单锚点**:库 → Folder(可选、单层、零权限语义)→ Document/Entry;权限、发布、关联全部只作用于库级;深组织需求引导拆库;
4. **三段式元数据**:系统 / 治理 / 业务;业务字段 filterable 白名单制(多租户索引成本控制);
5. **双正交状态机**:内容态(draft→processing→indexed→archived,failed 显式驻留)⊥ 治理态(unverified→verified→stale);治理为**库级选配默认关**,隐式续验,Arda 同步内容默认豁免;
6. **发布阶梯**:private → ws_published(属主,面向 home WS)→ org_published(WS 管理员主动公开 / org 管理员强制公开);属主可撤即时生效;离职由 home WS 管理员移交;
7. **P 级双消费模式**:live 只读订阅(平台命名空间,pro+,不占租户存储)/ snapshot 实例化(biz+,WS 管理员,落地即 T 级、快照断更、并排重同步、许可两级消费权);
8. **关联消费**:user × product 服务端清单;新建库自动关联创建现场(普通记录,非绑定);关联不能扩权;
9. **Arda/Karda 边界裁定**:载体归 Arda、语义消费归 Karda;三问裁定(消费形态/真值归属/变更频率);入 Karda 的结构化内容必带 source_ref。

---

## 5. 能力层:已定决策摘要(细节见 100-kb-model §5-7、120-retrieval-tools、200-arda-channel)

### 5.1 加工域

深度解析多阶段管线为 v1 重点投入(对标 RAGFlow);ProcessingTemplate v1 预置六种(general/qa/table/manual/paper/legal),org 可调参不可自建;文档级可覆盖库级模板;embedding 经 Atlas、库级锁版本、变更受控重建;图谱抽取 v1 留扩展点;Arda 通道摄取按 200-arda-channel 契约(notify-then-pull、hash 幂等、墓碑删除、毒丸隔离);包实例化 = 快照落 T 级 + org 命名空间重建索引。工程细节归 110-processing。

### 5.2 检索域(产品核心)

- **求值链**:验签四元组 → 白名单(关联 ∩ 可见 ∧ entitlement,C2 缓存:事件失效为主 + 300s TTL 兜底)→ 命名空间内向量+BM25 双路 RRF 融合 → **跨命名空间候选并集单次统一精排**(rerank 经 Atlas;跨索引不做分数归一)→ 组装引用;
- **质量档位**:`verification_filter` 三档(verified_only / verified_and_untracked 默认 / all),默认档排除 stale;
- **范围表达**:检索默认零库配置(身份定范围,Glean 模式);可选 kb_ids 仅收窄不扩权;
- **降级契约**:rerank 失败回退 RRF 序标注 degraded;单命名空间故障返回部分结果标注 partial,不互相阻塞;
- 引用溯源:Chunk/Entry 级出处 + 血缘 + 治理状态 + live 包版本标注。

### 5.3 应答域

单轮带引用问答;生成经 Atlas 受调用方 WS 配额;模型 token 归 Atlas 上报,Karda 仅报自身调用计量;不做对话管理/编排/多轮(归 agent)。

### 5.4 治理域

验证与时效(选配、隐式续验、同步豁免)、质量档位接入检索、库级检索质量评估报告 + **召回测试**(Console 标配)、发布/晋升/移交/实例化与级联撤销全量审计(接 L0)。

---

## 6. 授权与隔离设计

1. **求值链**:见 §5.2;安全底线 = 召回白名单先于任何检索执行,降级路径不得绕过;
2. **存储分工**:grant/发布状态/P 包订阅态存平台侧(Karda 经 C2 消费,不自建授权存储);**关联清单存 Karda**——它是消费侧配置非授权数据,不参与安全判定(安全由可见集保证),不违反上述约束;
3. **索引隔离**:租户数据 org 级物理 collection/namespace;org 内按 (owner_type, owner_id) + 发布状态白名单过滤;平台命名空间仅存平台内容,联合召回租户数据零流出;
4. **SharingGrant 资产级 scope**(retrieve/apply/read)与 product_210 OAuth scope(v1 = `tool:karda`)为两个层面,实现不得混淆;
5. **service 模式硬规则**:无 `sub` → 不触达任何 private 态 U 级库;且创建/关联/写入类工具仅 OBO(§7);
6. **级联撤销双事件**:revoke_binding(内容级联,200-arda-channel)与 visible-set-invalidate(授权视图,平台侧)独立投递、Karda 双重检查,任一先到无泄漏窗口;P 包退订 live 即时不可召回,已实例化 T 级库不受影响(许可条款另约);
7. **silo-on-demand**:极端敏感/驻留合规知识可申请独立索引域,例外审批,存储抽象层预留。

---

## 7. 工具面与协议义务(细节见 120-retrieval-tools §6、product_210)

**v1 七工具**:`karda.search` / `karda.ask`(OBO+service)、`karda.list_kbs`、`karda.attach_kb` / `karda.detach_kb`、`karda.create_kb`、`karda.write_document` / `karda.create_entry`(以上创建/关联/写入类**仅 OBO**,service 一律 403)。

**边界**:发布/晋升/删库/治理配置/实例化等审慎动作**不进工具面**,归 Console 与管理 API(v2 视 agent 治理场景带用户确认再议)。

**协议义务**:命名空间 `karda.*` + `/.well-known/vxture-tools` 清单;RP 八条纪律(含绝不接受 AUTH_INTERNAL_TOKEN);计量经 C3(`karda.search`/`karda.ask` per_call、`karda.ingest` per_doc,workspace 取 token claim;模型 token 归 Atlas 不重复计);错误封套 401/403/409 语义遵循 product_210 §7;版本纪律锁 major。

Karda 作为 caller(调 Atlas/Arda)遵守 product_210 §3.4;Binding 登记用 OBO(属主校验)、增量运行用 service(200-arda-channel §8)。

---

## 8. 对外接口关系

| 对象 | 关系 | 契约要点 |
|---|---|---|
| Ontos | 消费 Schema | 图谱抽取按 Ontos Schema(v2);ContentTemplate 字段语义映射 v1 存不消费;版本兼容策略入契约 |
| Atlas | 消费模型 | embedding/rerank/生成全部经 Atlas,计量归调用方 WS;Karda 零模型宿主 |
| Arda | 消费内容通道 | **契约 = 200-arda-channel**:Binding 模型、notify-then-pull、最小摄取信封、墓碑删除、revoke 级联;v1 不透传源侧 ACL(库为权限单元,有意简化,留 v2 透传位) |
| Runa | 被技能引用 | 引用非代理:技能运行时以 agent 身份直连 Karda 入口 |
| L0 | 消费平台设施 | org/WS/entitlement、C2 可见集(用户维度)、可见集失效事件、C3 计量与 webhook、审计、IdP、协议规范、(可选)沙箱 |
| L3 agents | 提供工具面 | 唯一直连通道;agent 为集成应用方 |

---

## 9. v1 范围与演进路线

原则:**检索质量是地基**,v1 做深「加工—检索—授权—关联」主线。

### v1

- 资产层:P-T-U 对象模型 + 血缘;单库类型 + Document/Entry + 双模板(六预置加工模板、FAQ/术语/SOP 三预置内容模板);Folder;三段式元数据(filterable 白名单);U 级全流程(创建/上传/绑定/API 写入/发布/撤回/晋升/移交);T 级基础版;P 级双消费模式 + 首个知识包试点;
- tier 映射(示例,终版归 L0 订阅配置):pro = live 只读订阅;biz = 可实例化;
- 消费模型:关联清单全流程(服务端存储,创建现场自动关联);
- 加工域:深度解析管线(重点)、模板化分块、向量化、增量更新、failed 驻留与重试、包实例化;Arda 通道(200-arda-channel 契约,backfill + incremental + 墓碑 + revoke 级联);图谱留扩展点;
- 检索域:RRF 双路 + 统一精排、跨命名空间联合召回、verification_filter、C2 消费缓存(事件 + TTL)、引用溯源、降级契约;性能预算 search P95 < 700ms(120-retrieval-tools §7);
- 应答域:单轮带引用问答;
- 治理域:选配验证(隐式续验、同步豁免)、质量档位、召回测试、审计接入;
- 协议面:七工具 + 全部 RP/计量义务;
- Console:库管理(含双模板配置)、发布/晋升/移交、包订阅与实例化、关联清单管理、召回测试、失败件视图、基础用量。

### v2(对齐蓝图 §7/§8/§11:知识资产模型起步)

- **知识资产扩型**(蓝图核心方向):Contextualization + Entity / Fact / Evidence 抽取入加工管线;Fact / Claim / Entity / Event / Evidence 成为一等资产对象(断言级溯源在此闭合——据谁所说、何时、哪一版);
- **Knowledge API 扩面**:retrieve / get / browse / find_entity / get_evidence / get_context,双通道同步暴露;
- **深解析接线**:Atlas A2(OCR / Layout / 表格)接入 deep-parse 路径;
- 图谱抽取 + GraphRAG 混合检索(Ontos 实例消费,归属待 KD-205);Web / External 连接器;
- 治理域深化(验证规则化、质量报告);自适应检索;P 级知识包 SKU 化与内容生产管线;org 自建加工模板;定向共享(grantee=user)与源 ACL 透传视需求;silo-on-demand 审批流;工具面治理动作(带确认交互)复议。

### v3(知识运行时方向,蓝图 §10 的远端)

Agentic Retrieval / Graph Retrieval 成为主检索形态(定位不变——RAG 只是机制);基于 agent 活动流的沉淀建议与上下文推送;检索—推理—验证一体化编排,与 Runos 技能生态协同。

---

## 10. 对标差异(定位叙事)

- vs **Glean**:权限感知统一检索同源,但"统一"= 调用方可见范围并集而非中心拉通;范围由身份服务端解析直接采纳其模式;语义/数据面由 Ontos/Arda 显式承担;个人知识跟人走、跨产品经关联即用,超出其组织检索范式;源 ACL 不映射为有意偏离(库为权限单元);
- vs **Guru**:验证体系(选配、隐式续验、质量档位、同步豁免)成建制吸收至治理域;卡片模板思想落为 ContentTemplate;
- vs **RAGFlow/FastGPT/Dify**:解析深度对标 RAGFlow(其 chunk method 落为 ProcessingTemplate)、分层检索对标 FastGPT、元数据机制对标 Dify(白名单制收紧);库在平台层、应用只关联——库与应用彻底解耦是结构性差异;
- vs **Snowflake/Salesforce**(分发模式):P 级双消费模式对齐 live share / managed package 与物化副本 / unmanaged package 成对形态;
- vs **Notion/飞书**:不做协作编辑器,内容生产经连接器接入,Karda 专注加工—检索—治理。

---

## 11. 产品级待拍板项(子文档级待拍板见各子文档)

| # | 决策项 | 说明 | 倾向建议 | 状态 |
|---|---|---|---|---|
| 1 | 图谱实例归属 | 实例存 Karda 或 Ontos | v2 前拍板 | 待 KD-205(v2) |
| 2 | Arda/Karda 边界裁定规则确认 | §4-9 三问 + 载体/语义原则 | **已确认 2026-07-27**：平台已裁定「连接=Arda、理解=Karda」+「karda 对 arda 实现层依赖不上升为结构概念」；arda=连接器之一,非结构依赖 | **KD-104 收口** |
| 3 | 应答域范围 | 单轮带引用问答是否入 v1 | 入 v1,多轮不做 | **已定 KD-004** |
| 4 | T 级库内容生产 | 是否自建轻量编辑 | v1 纯接入 | **已定 KD-005** |
| 5 | 首个 P 级知识包选型与许可策略 | 内容方向 + 是否允许实例化 + 配套 ContentTemplate | 与首批 L3 行业方向对齐 | 待 owner KD-201 |
| 6 | private 库保留期时长 | 离职冻结后清除周期 | 90 天,归 L0 | **已定 KD-202**(2026-08-25,采纳倾向 90 天) |
| 8 | 客户删除请求波及已发布内容 | 已发布=已进入他人检索面,删除请求的波及范围 | 全域回收 | **已定 KD-206**(2026-08-25 新登记并同日落槌) |
| 7 | 实例化与归档存储计量口径 | 包实例与 archived 内容占 WS 存储的计量方式 | 计入 WS 存储配额经 C3 | 待 owner KD-203 |

---

## 12. 联动修订登记

- product_100 §3.2 Karda 定义句更新为 §1;
- product_110:增补章节 v2 合并;P-T-A → P-T-U 同步;边界裁定(#2)确认后关闭其待拍板;
- product_310/C2、C3:可见集用户维度、可见集失效事件、arda 通道 webhook 投递——平台侧实施登记;
- 接口契约:Karda×Ontos(可后置)、200-arda-channel 跨产品评审(Arda 侧五项对齐清单);
- Console 需求汇总:见 §9 v1 末条。

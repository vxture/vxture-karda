# 180 - 知识图谱基础技术选型对比

日期：2026-11-27（Asia/Shanghai）。状态：**owner 已批准 PostgreSQL + G6 + Jena；选型记录保留，实施状态见 [202](../70-workplan/202-graph-foundation-g6-jena-20261127.md)**。

本文件记录选型对比阶段；后续 owner 已授权开始技术引入与迁移规划。遵循「计划 → 批准 → 完整板块实施 → 逐项确认 → 汇报」。既有生产版本保持 v0.12.50。本文件是基础技术选型专项，补充 [160 持续知识架构](160-continuous-knowledge-architecture.md)，不将旧设计中的计划能力标为已实现。

## 1. 结论与选择原则

采用成熟基础组件。Karda 负责知识业务、权限、版本、证据、审核与产品交互；不继续自研通用绘图引擎、布局引擎、图查询语言、标准校验器或逻辑推理器。

**建议主路线：PostgreSQL 权威数据 + AntV G6 图谱工作台 + Apache Jena 语义服务（ARQ/SPARQL、SHACL；需要持久查询投影时使用 Fuseki/TDB2）。** Jena 是本体与语义查询的首选候选，须通过下一节约定的功能接入确认再锁定版本。Neo4j 是属性图路线备选，不在首期同时运行两套图数据库。RDF4J 是 Jena 的同类替代候选。

相对上一轮初步建议，本轮提高 Jena 优先级的原因是 owner 明确要求本体融合。若主要目标只是关系路径和网络分析，Neo4j 很有竞争力；当标准语义、类型层级、约束、可交换本体成为核心时，RDF/SPARQL/SHACL 路线更直接。两种路线的开发模型、推理能力与成本必须分别评价。

本轮是官方资料、许可证及仓库代码对比，不是实验性能排名。没有安装候选数据库、浏览器验证、压测、全量测试或生产变更。项目最近提交仅证明可见活动，不能代替稳定性和安全评审。

## 2. 现状与必须覆盖的功能

核对仓库基线 ddf4a4b4d326a4e3b11fd8aa2cd0c948f9b753e5：

- PostgreSQL 已保存实体、断言、审核、关系、证据关联、Schema 和不可变发布版本。已有数据继续保留。
- 现有 GraphCanvas 是自研 React/SVG；graph-view 使用自研环形/分组布局、有界局部模块度优化及 BFS 路径。
- 当前图处理限制为单次 500 节点/1,000 条关系；局部社区和路径不代表全库计算。
- Ontos 尚未开发。已有本地编译配置不是外部本体平台，也不是 OWL/SHACL 完整实现。
- 未发现已接入 G6、Sigma、Cytoscape、Neo4j、Jena 或 RDF4J 的应用依赖。

选择标准由三个目标推导：智能体可取得带证据的多跳知识；人可探索、编排和展示图谱；本体可表达类型与约束并支持明确边界的推理。

共同必需功能：有向、多类型、多重关系；稳定实体/关系标识；来源及版本；类型层级与约束报告；展开、路径、主题子图；保存视图与导出；权限收缩和撤回后查询收敛；事实、候选、推导结论清楚区分。中文标签、证据卡片、分组、布局恢复及 Next.js/React 接入属于展示选型重点。

## 3. 可视化对比

| 方案 | 已确认能力及适配点 | 成本与边界 | 结论 |
| --- | --- | --- | --- |
| **AntV G6** | 节点/边/Combo、交互、动画、插件；力导向、层级、径向等布局；默认 Canvas，官方支持 SVG/WebGL 渲染器；部分布局可 Worker/WASM | G6 主版本与布局 API 有迁移成本；自定义节点、字体、导出、渲染器功能差异需在固定版本验证；React 通过客户端组件管理生命周期 | **首选**：适合业务图谱探索、主题组织和演示 |
| **Cytoscape.js** | 成熟交互图分析、compound nodes、选择器、图算法与布局扩展；适合网络分析工作台 | 复杂业务卡片与叙事展示仍需业务开发；不同扩展的许可证及维护独立核验；不把其所有扩展算作核心内置 | **第二候选**：若分析算法、嵌套结构成为主要需求 |
| **Sigma.js + Graphology** | WebGL 图渲染，Graphology 管理图结构与算法生态；侧重大网络探索 | 业务卡片、复杂分组与编辑流程需要更多扩展；WebGL 标签、导出、无障碍需要专项接入处理 | 保留为网络总览候选；首期不与 G6 同时集成 |
| D3 基础库/继续自研 SVG | 自由度高，可保持既有 UI | 需要自行承担绘制、命中、布局、交互和插件体系的长期维护 | 不作为主路线 |

G6、Cytoscape.js、Sigma.js 核心所核验许可证为 MIT。Graphology 为 MIT。层级布局优先复用 G6 内置布局；只有嵌套/端口等明确缺口再考虑 ELK.js（EPL-2.0，需独立审查），不提前叠加布局组件。

G6 有 WebGL 选项不等于 WebGL 对所有节点、插件及导出功能完全等价。本平台优先 Canvas + 成熟布局；按实际功能决定渲染器，不因旧机器数值更换架构。保留 HTML 实体/关系目录与证据面板以支持键盘及辅助技术，不能假定 Canvas 自动满足无障碍要求。

## 4. 图存储、查询与语义底座对比

| 方案 | 模型与优势 | 本体/推理边界 | 运维与许可证 | 本平台判断 |
| --- | --- | --- | --- | --- |
| **Apache Jena：ARQ + Fuseki/TDB2 + SHACL** | RDF、SPARQL、命名图、标准序列化；可用属性路径完成邻域与多跳匹配；同一技术栈覆盖查询与校验 | SHACL Core/SPARQL Constraints；RDFS、通用规则及不完整 OWL 子集推理；**不是完整 OWL 2 DL 推理器**。任意最短路径/复杂图分析不能视为全部内置 | Apache-2.0；增加 Java 服务、持久卷、备份与健康监控。标准 TDB2 方案不能等同自动分布式 HA | **首选语义路线**，与本体目标最契合 |
| **Eclipse RDF4J** | RDF/SPARQL、Repository/Sail、服务端与 Workbench；ShaclSail 提供事务校验 | 具体支持的 SHACL 特性需按固定版本核对；内置 RDFS/推理组件不能视为完整 OWL 2 DL | 本次根许可证为 Eclipse Distribution License（BSD 三条款风格）；模块/传递依赖逐项复核。Java 服务成本与 Jena 同类 | **同类备选**；若增量写入和事务 SHACL 是主矛盾再优先 |
| **Neo4j Community/Enterprise** | 属性图、Cypher、原生有向关系和路径查询；生态成熟，关系探索表达直接 | RDF/OWL/SHACL 并非核心统一语义体系；扩展和模型映射另计，GDS/Bloom 不等于免费核心能力 | Community GPLv3；Enterprise 商业授权。官方将集群、在线备份等列入 Enterprise 能力，不能按免费版承诺企业特性 | **属性图路线强备选**；若最终主需求偏路径/网络分析，可替换 Jena 查询投影 |
| **Apache AGE** | PostgreSQL 扩展，SQL/openCypher 混合查询，复用 PG 生态 | 不提供完整本体校验/推理；Cypher 覆盖度及驱动兼容需核实 | Apache-2.0；须安装数据库扩展并确认 PG 版本、升级、备份恢复；当前平台数据库不可由产品擅自改造 | 暂不首选，扩展运维依赖和本体补栈成本较高 |
| **GraphDB** | 产品化 RDF/SPARQL 与推理工具、管理界面 | 各版本规则/推理/SHACL 能力按所购版本确认 | 商业产品；官网明确从 11.0.0 起包括 Free 在内均需要有效许可证；免费可用不等于开源 | 若接受商业采购，可作为减少自运维/开发的询价候选 |
| 继续纯 PG + 自研通用图算法 | 现有事务与授权最容易复用 | 自行承担图查询、约束和推理，重复建设显著 | 少一个服务，但增加底层研发责任 | 保留权威存储；不继续扩成自研图引擎 |

RDF 适合语义互操作，属性图适合直接表达带属性的关系，二者均可承载知识图谱。RDF 路线必须显式保存关系/断言身份、证据和版本，不能只导出 subject/predicate/object 后丢弃关系治理信息。建议以稳定 statement/relation IRI 表达关系资产并关联两端、谓词、来源和审核；向工作台投影时恢复业务有向边。RDF-star/RDF 1.2 的具体支持按锁定版本另核，不作为首期兼容前提。

不要把 SPARQL property paths 的可达性等同最短路径、路径完整解释或因果推理。若首期有严格最短路径需求，必须在接入确认时选择成熟算法实现或切换属性图路线；不承诺临时手写通用查询引擎。

## 5. 本体、约束与推理如何选

| 能力 | 建议复用 | 明确边界 |
| --- | --- | --- |
| 术语、类、属性与层级交换 | RDF/RDFS、OWL 的明确子集；Turtle/JSON-LD | 不是把所有现有 JSON Schema 自动转换为 OWL；映射需明确支持集，无法表达的配置拒绝或保留独立约束 |
| 必填、值类型、基数、关系两端及跨属性约束 | Jena SHACL | SHACL 是数据约束校验，不等于 OWL 逻辑推理。缺少材料通常是校验问题，不应直接推断业务为假 |
| 类型继承、受限传递关系与明确业务规则 | Jena RDFS/规则引擎，锁定规则集 | 定义范围、终止预算、规则版本及支持的推导解释；不声称完整 OWL 2 DL |
| OWL 2 EL 分类/推理的明确需求 | ELK Reasoner 候选（Apache-2.0） | 官方说明为 OWL 2 EL 的片段；不是通用 DL。仓库可见最近提交较早，采用前确认稳定版本、维护与兼容性 |
| 完整 OWL 2 DL 一致性/分类 | 后续专门比较成熟 DL 推理器及商业产品 | 当前未选定、未实现；不以 Jena 默认推理器替代此承诺 |
| 本体可视化编辑、发布与权限工作流 | 平台业务开发，复用图组件；外部编辑器只作工具 | Karda 消费版本化语义包；Ontos 尚未开发，本轮不把 Jena 接入称为 Ontos 建成 |

推导关系进入服务必须能定位规则版本、前提关系/断言、来源版本及引擎配置。引擎不能输出足够解释的推导，仅供分析，不冒充正式证据边。前提撤回或本体变化后，以新发布版本重建推导；历史结果不能绕过当前权限。

## 6. GraphRAG、LightRAG 与 LLM Wiki 的位置

| 方案 | 可借鉴/复用 | 不宜承担的责任 |
| --- | --- | --- |
| Microsoft GraphRAG（MIT） | 实体/关系抽取、社区摘要、面向问答的图上下文组织 | 官方 README 当前已说明主要进入维护模式，不再接受新功能 PR；不选作平台长期核心底座。不是本体引擎、权威事实库或租户授权服务 |
| LightRAG（MIT） | 图与向量协同检索、实体/关系上下文组织、可选存储适配；候选检索插件 | 全套接入会增加 Python/运行服务并与既有编译、存储、模型计费链重复；工作空间隔离不等于本平台当前授权及撤回语义 |
| LLM Wiki | 既有对标中的持续整理、知识页互链、主题和来源维护 | 既有核验上游 GPLv3 源码不直接并入产品；不能代替图数据库、可视化及标准本体推理组件 |

首期复用现有 Atlas 调用和知识服务，图引擎提供可验证的关系检索，文本/向量结果作为补充。模型不直连数据库，不执行任意生成 Cypher/SPARQL；业务工具参数化并限范围。LightRAG 若后续引入，作为可替换检索策略，通过相同证据/授权契约接入，不重建第二个权威库。

## 7. 三条整体路线的取舍

| 路线 | 适配主要目标 | 初期成本 | 选择 |
| --- | --- | --- | --- |
| **A：PG + G6 + Jena** | 本体语义、标准交换、约束校验与证据图查询共同推进 | 新增一个 Java 语义服务；需 RDF 映射、版本投影和备份；跨发布投影一致性需建设 | **推荐**：符合三个核心目标，减少本体底层自建 |
| B：PG + G6 + Neo4j | 属性图探索、多跳路径、网络分析优先 | 图投影同步 + GPL/商用版本决策；后续完整本体再补语义栈 | 当核心路径查询在 A 中难以完成时采用，不与 A 首期双栈 |
| C：PG + G6 + Jena + Neo4j | 同时有复杂语义和独立属性图分析负载 | 两套图数据复制、两套运维、撤回收敛和一致性显著更复杂 | 当前不采用；有独立功能证据后再决策 |

图查询引擎上线与 G6 替换可以分阶段，但不能把临时纯 PG 实现当作无限扩展自研算法的理由。最终运行版本与镜像 digest 在实施阶段固定；本轮使用开发分支/官方当前文档比较能力，不将 latest/SNAPSHOT 当作可直接部署的版本。

## 8. 与现有数据及权限接入的约束

1. PostgreSQL 继续持有事实、证据、审核、发布与权限权威。语义查询投影从指定发布版本生成，可删除、重建；禁止两边独立修改同一事实。
2. 发布流水线使用事务事件/持久任务触发投影构建，按 workspace/kb/release/schemaRef 保存清单；构建完成核验后切换投影头。PG 与外部引擎没有单一 ACID 事务，必须明确 pending/ready/failed 状态、重试与重建。
3. 查询对齐当前发布与来源有效性。版本不匹配、授权快照失效或来源无法核验时拒绝或明确降级；不能把旧图当作最新知识。权威撤回先阻断读取，再异步清理投影。
4. 命名图/标签是数据分区，不天然提供本平台行级授权。必须先限定可见有效事实集合，再展开、求路径、聚类和计数；禁止先走私有关系后仅过滤末端。公开 SPARQL/Cypher 入口不开放。
5. 规则推导的前提也必须处于授权有效集合。不能全库推理后仅过滤结论而暴露私有前提；缓存至少绑定身份授权版本、发布版本、Schema/规则版本。
6. 每条业务关系保留稳定 ID、方向、类型、origin、assertionIds；每项证据保留来源文档/版本/锚点。sameAs、跨库实体融合与传递规则均需显式业务裁决，不按同名自动合并。
7. G6 只接收服务端裁决后的展示图。保存视图只保存布局/筛选/关注意图，恢复及导出重新鉴权。组件状态不能充当新的知识权威。
8. 外部引擎通过平台支持的服务部署流程引入。当前产品不修改平台数据库扩展、服务器变量或客户权限；这些部署交付由对应平台责任方执行。

## 9. 复用与自研边界

| 直接复用成熟基础能力 | Karda 必须负责的产品能力 |
| --- | --- |
| G6 绘图、相机、布局、分组、交互基础及导出 API | 工作台布局、业务节点样式、证据面板、主题叙事、视图保存、当前权限导出 |
| Jena RDF/SPARQL 解析执行、SHACL 标准校验、已支持的规则执行 | 业务 Schema 映射、版本审批、来源/审核门禁、规则准入、解释和错误报告 |
| 成熟图算法包/G6 支持的算法接口 | 在授权有效图上组织输入、预算、作用域、结果解释；社区不能冒充本体分类 |
| 原有 PostgreSQL、Atlas、检索及后台任务基础 | 不可变发布、投影构建切换、撤回收敛、重试恢复、Agent 统一服务 |

组件不能消除业务集成工作。先进性体现在语义一致、可解释、可追溯、可演进，而不是基础组件数量。

## 10. 下一步批次与逐项确认清单

**本轮选型资料任务：**

- [x] 核对现有代码和数据基础，明确局部图限制。
- [x] 对比三种成熟可视化组件及自研成本。
- [x] 对比 Jena、RDF4J、Neo4j、AGE、GraphDB 及纯 PG 路线。
- [x] 区分 RDF/OWL、SHACL、规则推理和 DL 推理的职责。
- [x] 核验关键许可证、官方维护声明及主要运维成本。
- [x] 给出整体推荐、备选和权威数据接入边界。

**待批准的下一实施阶段（一个完整板块，不是本轮已经执行）：**

- [ ] S1 集中功能接入确认：固定稳定版本；用同一组小型合成数据确认 G6 节点/多重有向边/分组/中文/布局/导出，及 Jena RDF 映射、类型层级、SHACL 违规、受限推导解释、跨文档路径、命名图范围；记录支持/需适配/不支持，不做压测。
- [ ] S2 确认并记录 ADR：锁定 A 路线或根据 S1 的具体功能缺口选择 B；交付依赖清单、许可证/NOTICE、部署及退出方案。不能在 S1 失败后悄悄改成自建引擎。
- [ ] S3 完整建设图谱探索与展示中心：成熟组件接管画布/布局，服务端查询与版本投影，探索/证据/保存视图/主题/叙事/版本差异/导出完整闭环；详单在批准前单独提交。
- [ ] S4 阶段末集中回归与正常 PR/发布，逐项确认。本体平台 Ontos、完整 OWL DL、业务质量、外部 Agent 正式联调保留各自验收。

S1 是实施阶段内一次集中功能确认，不产生多次细碎发布；S3 仍须完整板块计划批准。本轮未运行软件测试，未合并、未部署；固定主验收仍为 17 项：7 完成、6 进行中、4 待门槛，I1 继续暂停。

## 11. 官方来源与核验记录

核验日：2026-11-27。只读取公开官方文档/仓库，未复制上游代码到应用。分支文档可变；下面 SHA 是当日各仓默认分支可见提交，**不是部署锁定版本**。G6 能力资料另读取 v5 分支及官网版本标记 5.1.1 的页面；Neo4j GPL 文件另核对 5.26.0 标签，不用该标签代表当前全部产品版本。

- [G6 官方仓库](https://github.com/antvis/G6)、[布局](https://g6.antv.antgroup.com/en/manual/layout/overview)、[渲染器](https://g6.antv.antgroup.com/en/manual/further-reading/renderer)、[固定 MIT 许可](https://github.com/antvis/G6/blob/d17fcd86534850e8af1e5e8d6eef9f443359915c/LICENSE)。当日默认分支 d17fcd86534850e8af1e5e8d6eef9f443359915c。
- [Cytoscape.js 官方仓库](https://github.com/cytoscape/cytoscape.js)、[MIT](https://github.com/cytoscape/cytoscape.js/blob/master/LICENSE)。当日默认分支 b768734100fa49d24f5652361e4f2f3bdbcbce86。
- [Sigma 官方仓库](https://github.com/jacomyal/sigma.js)、[MIT](https://github.com/jacomyal/sigma.js/blob/main/LICENSE.txt)、[Graphology](https://github.com/graphology/graphology)。Sigma 当日默认分支 e7748c88c861f19cab00be80cb7f836c5fef61e8。
- [Jena Fuseki](https://jena.apache.org/documentation/fuseki2/)、[TDB2](https://jena.apache.org/documentation/tdb2/)、[SHACL](https://jena.apache.org/documentation/shacl/)、[推理支持和限制](https://jena.apache.org/documentation/inference/)、[固定 Apache-2.0 许可](https://github.com/apache/jena/blob/b8375c286a409dcadb4d5821d888db01375f3644/LICENSE)。当日默认分支 b8375c286a409dcadb4d5821d888db01375f3644。
- [RDF4J 官方仓库](https://github.com/eclipse-rdf4j/rdf4j)、[SHACL/事务支持](https://rdf4j.org/documentation/programming/shacl/)、[固定 EDL 许可](https://github.com/eclipse-rdf4j/rdf4j/blob/d645d1d8413768329be1c21ad035377574ae3648/LICENSE)。当日默认分支 d645d1d8413768329be1c21ad035377574ae3648。
- [Neo4j 官方版本能力表](https://neo4j.com/docs/operations-manual/current/introduction/)、[5.26.0 GPLv3](https://github.com/neo4j/neo4j/blob/5.26.0/LICENSE.txt)。当日默认分支 2994b43b44f35bf6520bd2667ab181bb76a45585。Community、Enterprise、GDS、Bloom、驱动及插件许可分别核验；GPL 不自动意味着网络调用的独立业务应用必须开源，私有化分发/修改/链接方式仍需具体审查。
- [Apache AGE 官方仓库/Apache-2.0](https://github.com/apache/age)。当日默认分支 2c8be68f4559a9acb78733bbb3a2fa22c98ac80e。
- [GraphDB 官方产品与许可申请说明](https://www.ontotext.com/products/graphdb/)。两条旧文档路径返回 404，未采用其内容；关于 11.0.0 全版本需有效许可的判断来自当前官方产品页。未获取报价/合同，不声称具体采购金额。
- [W3C SHACL](https://www.w3.org/TR/shacl/)、[OWL 2 Primer](https://www.w3.org/TR/owl2-primer/)、[ELK 官方说明](https://github.com/liveontologies/elk-reasoner)、[ELK.js](https://github.com/kieler/elkjs)。ELK 当日可见默认分支 cc556787886e1ace3ccfef3423dd2a727de91053，提交时间 2024-07-11；不据此单独断言项目停止维护。
- [Microsoft GraphRAG 固定维护声明](https://github.com/microsoft/graphrag/blob/bc7c828d23f50f030f048eaf6d2b3ebe5e537958/README.md)、[MIT](https://github.com/microsoft/graphrag/blob/main/LICENSE)。
- [LightRAG 官方仓库](https://github.com/HKUDS/LightRAG)、[MIT](https://github.com/HKUDS/LightRAG/blob/main/LICENSE)。当日默认分支 47038cf1619b486b5409230aff1e98ba6a6ce5ca。
- [本仓 LLM Wiki 已有源码与许可核验](../70-workplan/90-llm-wiki-source-benchmark-20261124.md)。

所有候选在正式引入时仍须锁定实际稳定版本、传递依赖与镜像，走既有依赖安全门禁；本轮许可证结论不替代最终交付组合的逐项核验。

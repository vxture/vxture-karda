# K0 源码盘点、接口草案与评测入口

日期：2026-11-24。状态：K0a 本地设计/盘点/评测脚手架完成；**K0 整批未验收**。
材料均为合成例子，无真实客户资料、无生产 API 调用、无 Atlas/Ontos 连通性声明。
执行日志与检查结果见 [批次进度](80-knowledge-platform-rebuild-20261124.md#70-执行进度2026-11-24)。

## 10. 现有能力审计

| 入口 | 事实与处理决定 |
| --- | --- |
| app/kb/assertions/kinds.ts | 已有在线 isRecallable：只认 indexed、有支持且未被替代；新图投影复用，不以后台清理作为正确性前提 |
| app/kb/assertions/entity-read.ts / evidence-read.ts / context-read.ts | 已有实体/证据/上下文读取逻辑，含不可见与不存在统一处理；K2 复用，需接新的类型关系及模式 |
| app/kb/assertions/curate.ts | 已有人工确认、剔除、冲突裁决；沿用确认即收录，不能让编译重算覆盖人工裁定 |
| app/kb/assertions/extract-pass.ts / extract-run.ts | 已有按文档活动版本和任务记录找待抽取材料的方式，需评估独立的 Schema/配置失效键与发布事务 |
| app/kb/processing/ir.ts / chunk.ts | 已有原文规范化、区间/分块；保留其偏移定义，新增图片表格锚点不伪装为文本偏移 |
| app/kb/retrieval/bm25.ts / search.ts / visible-set.ts | 保留文字与混合检索；本次基线只执行可离线复跑的 BM25 核心；不称为现行全链路质量 |
| app/kb/tools/catalog.ts / dispatch.ts / backends.ts | 已有工具声明与派发；新图契约当前仅内部，不修改公开工具清单和计费指标 |
| app/(portal)/assets/[kbId]/knowledge/knowledge-client.tsx | 已有确认工作台，适配新实体和关系审核；大幅图谱另在 K3 接知识服务 |
| prisma/schema.prisma / incr/0006_assertion_model.sql | Assertion/Entity/Evidence/Span/AssertionMention 已建；尚无本轮版本化 Schema、有类型 Relation、编译发布和依赖事件表；K1b 做增量设计与锁步迁移 |

本次审计证据来自源码；旧 README「产品未开始」与产品定义旧路线表不能用来判断已交付范围。
关联/可见集、角色、租户、C2/C3 和原文访问复用现行产品契约；不修改平台代码或真实权限。

## 20. 四类接口草案

- **知识包**：基于服务端身份求可见库与关联交集；mode=published_knowledge/source_only，返回 SchemaRef、实体/断言/关系、逐条证据、状态与缺口。旧 search/ask 兼容，K2 前不公开新参数。
- **邻域投影**：内部 SchemaRef + 权威来源状态 + 授权 scope + seeds/type/maxHops/maxNodes/maxEdges。K1a 已实现纯函数契约；没有 HTTP、生产 DB 或当前用户输入到 scope 的接线。
- **证据**：延用 citation_id 原文定位与版本检查，保留文本半开区间；页面/表格区域要由真实解析回执支撑。
- **影响/撤回**：服务端治理范围内的来源与版本事件；由证据依赖索引计算受影响对象，旧事件不能覆盖新状态；持久化、重放和多实例一致性属于 K1b，当前未实现。

源码路径均相对 portals/app。正式设计见 [160](../30-design/160-continuous-knowledge-architecture.md)。

## 30. 可复跑的首个基线

从仓库根目录执行：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/run-baseline.ts
```

固定 8 段自行撰写的中文资料、12 道检索题（其中 4 道多资料题、1 道未知题）。
输出每题检索 ID、预期支持资料是否全部召回与支持资料 Recall@5。
**召回成功不等于结论正确，更不等于模型实际完成多跳推理。**
不读客户数据库、不需要模型密钥，不加入上游代码或测试数据。版本化报告见
[词法冒烟报告](100-k0-lexical-smoke-20261124.json)。

K0b 的退出条件仍是：≥60 道公开/脱敏真实题（其中 ≥20 道复杂题），可读原文版本、人工证据标注、
独立留出集和一致评分标准；真实原文/知识页/语义图同题对照及设备负载口径。
当前没有用于该评测的真实招标材料，因此 K0b 待材料和标注，不以合成扩题凑足数量。
K1a 的可独立验证契约代码可以先行；K1b/K2 的迁移或正式接线不能据此越过 K0b 数据与评审门槛。

## 40. 外部依赖及接入次序

| 外部面 | 当前做法 | 进入联调的证据 |
| --- | --- | --- |
| Atlas | 复用抽取/精排/向量接口的既有适配层设计；本次不调用 | 隔离空间真实推理、来源锚点、模型与计量归因 |
| Ontos | 自行撰写的带版本招标本体夹具，不作真实 Schema 发布 | K4 获取版本、校验/规则结果、版本变更与回滚记录 |
| Arda | 来源 source_ref 和版本接口草案，不改业务真值 | 授权事件、版本更新、撤回与重放回执 |
| Runos | 保持同一 Knowledge Service，现有工具接口兼容 | 注册/分发、OBO 鉴权和调用计量实际证据 |

## 50. K1a 的明确边界

新代码 app/kb/semantic/ 接受可信内部快照，用确定性规则投影现行业务关系：
过滤不可见、旧源、撤回、过期、无证据、未确认和类型不匹配的关系之后再遍历。
关系可沿两方向浏览，业务箭头仍保留 source/target；最多 4 跳、500 节点、1000 边。
跨库关系先禁用，多个库均可见也不能用其把实体并成同一对象。推导/相似性边当前均不入正式投影。
返回计数和截断标志只基于授权子图；不输出被滤掉证据的 ID。调用方传进来的 scope/来源状态必须在后续接线时来自权威服务，纯函数无法独自提供鉴权或分布式一致性。

## 60. 本地验证记录

2026-11-24，分支 codex/knowledge-platform-rebuild，新增契约不挂生产路由。

- 新增语义投影行为测试：20/20 通过，覆盖权限、跨库、撤回/多来源保留、源版本、有效区间、类型、预算和内部字段裁切。
- app TypeScript：tsc --noEmit 通过。
- 全量 app 测试含覆盖率：917 项，906 通过、0 失败、11 跳过；跳过项需隔离 Redis/Postgres 等环境，不能算通过。
- 文档编号、41 表 DDL/Prisma 锁步、i18n seam、工具登记、Atlas 契约检查通过；本次不新增依赖或数据库表。
- BM25 合成冒烟：15/15 个预期资料召回、11/12 题完整；未知题被词法重叠弱召回，原样保留作为拒答与证据判定的后续输入。

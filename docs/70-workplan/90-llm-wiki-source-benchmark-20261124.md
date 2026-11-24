# LLM Wiki 源码对标与 Karda 采纳清单

日期：2026-11-24。配套：[K0–K6 重构实施计划](80-knowledge-platform-rebuild-20261124.md)。本文件用于 K0 选型、设计输入和评测，不表示对应功能已交付。

## 10. 对标对象与复用方式

- 方法：[Karpathy 的 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)：原始来源、持续维护的 Wiki、组织与维护规则三层，以及摄入、查询和体检三类操作。
- 实现：[nashsu/llm_wiki 固定快照](https://github.com/nashsu/llm_wiki/tree/e08cfce65aad8b76b13546a081c1a8d4422b70c3)。已核对上游 [README](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/README.md)、[LICENSE](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/LICENSE) 和下列主要源码入口。上游是本地个人项目；Karda 是企业多租户知识服务，权限、证据与事实发布使用 Karda 自己的契约。
- 许可：上游 README 明示 GPLv3。Karda 的 [仓库规则](../../CLAUDE.md) 明定保留全部权利。**当前采用做法和可观察行为，自主实现；不复制源码、提示词、测试夹具、界面资产或文档原文，不引入上游包作为生产依赖。** 如某个组件值得直接集成，先从原发布方核对组件独立许可证、分发模式和依赖，再按现行 SCA 与仓库规则评估；GPL 源码不作为默认复用选项。

## 20. 逐项借鉴与验收

| 上游优势与源码入口 | Karda 的采纳方式 | 批次与验收 |
| --- | --- | --- |
| **先分析、后写入**：[ingest](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/ingest.ts) 先理解长期资料，再生成或更新页面；代码确定性更新目录，减少模型同时维护多份目录的漂移。 | Atlas 先输出结构化候选：主题、实体、关系和原文锚点；独立阶段按 Ontos 版本校验、比较差异、送审。已发布资产按依赖变化更新主题页；概览、目录和反向链接由服务生成。 | **K1–K2**：重复导入无重复资产；只刷新受影响主题；换模型或重嵌不抹掉人工裁决。 |
| **可恢复的增量处理**：[队列](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/ingest-queue.ts)、[缓存](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/ingest-cache.ts)、[提交协调](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/ingest-commit-coordinator.ts) 与[删除决策](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/source-delete-decision.ts) 把导入、重试、提交和保留多来源页面分开。 | 复用 Karda 工作队列及证据模型思路，按来源版本与配置留处理记录；用依赖索引定位局部更新。撤回一个来源时重新评估其支撑的断言；其他可见证据仍足以支撑的部分可保留，不把多来源页面整页删除。 | **K1**：中断恢复、重复和乱序、单来源与多来源撤回、替代、权限变化分别验收；可见性不依赖后台任务及时完成。 |
| **目录、主题页、正反链接和原文模式**：[链接补全](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/enrich-wikilinks.ts)、[检索入口](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/search.ts)、[使用说明](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/README.md)。 | 提供可浏览、可搜索的主题和实体页；按安全范围计算正反向链接。Agent 可选择「已发布知识优先」或「仅检索原始来源」；后者不把生成页、模型陈述和推导结果混入证据。 | **K2**：同问对照两种模式；仅原文模式的结果均锚定到可见源版本；失效证据不会通过旧链接或缓存绕过。 |
| **大图聚类、局部展开与布局性能**：[图谱视图](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/components/graph/graph-view.tsx)、[布局 Worker](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/components/graph/graph-layout-worker.ts)、[社区分析](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/wiki-graph-analysis.ts) 和[关联评分](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/graph-relevance.ts)。上游把显式链接、共来源、共同邻居和类型亲和度用于关联。 | 借鉴总览聚合与路径聚焦，评估 Worker 布局与按需载入。图上分开呈现**已确认的业务边、附解释的规则推导边、待审或相似性建议**；共同邻居、来源重叠和聚类只能帮助发现线索，不能变成业务事实或 Agent 证据。 | **K3–K4**：高密图可按主题钻取；边可点回证据；未授权边不参与对外聚合、路径及缓存；评测语义路径与关联信号的收益。 |
| **结构体检与人工审核**：[结构体检](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/lint-structural-core.ts) 找孤立页和断链；[审核清理](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/sweep-reviews.ts) 对需人判断的项目保持保守。 | 一条确定性检查流处理断链、不可用引用、过期来源；一条模型建议流找冲突、覆盖缺口、遗漏关系。沿用确认台，模型不能自行关闭待裁决冲突或把建议晋升为事实。 | **K2/K5**：用已知冲突和断链样本检验命中；能区分修复、忽略、人工裁决；记录误报和一次审核的工作量。 |
| **Agent 工具和成果回流**：[MCP 工具入口](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/mcp-server/src/index.ts) 提供项目、文件、搜索、图谱等操作；[资料调研](https://github.com/nashsu/llm_wiki/blob/e08cfce65aad8b76b13546a081c1a8d4422b70c3/src/lib/deep-research.ts) 支持主动扩充来源。 | 工具按身份提供搜索、实体、证据、有限图路径与上下文；有价值的问答、复盘、外部资料可提交草稿和来源，经审核再进入共享知识；不接入桌面端内置聊天执行环境。 | **K2/K5**：两类 Agent 拿到同样授权事实；回流有去重、来源和审核；外部材料未经确认不进入共享答案。 |

## 30. 后续扩展与选型

- **多模态来源**（K0 样本评估，必要时进入 K1/K2）：上游对 PDF 图像提取、视觉描述及原文跳转可作交互参考。若试点资质要求依赖扫描件、印章页或表格，则将 Atlas 解析、页码/区域或单元格证据纳入首场景验收；图像描述属于辅助线索，不作为原文证据本身。
- **可携带的 Wiki**（K5 验证条件成熟后排期）：优先先做主题页的 Markdown 导出试点，附版本、反向链接和授权可见来源引用。平台的权威记录仍在 Karda；导出重新按当前权限裁切。网页剪藏、目录监听、项目归档迁移按实际来源和使用频率排序。
- **对照方法**（K0）：固定一组样本，比较原文检索、整理后的知识页、语义图查询三条路径；对比覆盖、证据充分性、冲突识别、更新时间、人工确认量和成本。开源桌面应用如需运行，仅在隔离环境使用公开样本，记录版本和设置，不加载客户数据或公司模型凭据。

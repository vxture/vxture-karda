# 智能体任务上下文组装与交付中心

日期：2026-11-28。实施正本：[210计划](../70-workplan/210-agent-task-context-center-20261128.md)。状态：已通过阶段验收并上线v0.12.57；八项确认见210第7节。

## 1. 架构与职责

在现有知识服务之上新增context能力，配方存于ServiceConfig.context，随knowledge_service_version不可变发布；沿用原create/save/preview/apply、CAS、原因、停用与历史版本复制回退。不建设独立本体建模平台，不依赖未开发的Ontos。

读取链：OBO或RP登录身份 → 当前服务快照/知识库挂载 → 调用记录占位 → 当前知识指纹 → 逐需求分区调用现有事实/主题/原文/图谱适配器 → 证据归一与完整单元选择 → 再次检查服务与知识指纹 → 返回整包 → 保存无正文元数据。

旧facts/topics/source/package请求保持原契约。context配方的每个分区显式选择一种能力，不偷偷增加原文回退。无需调用生成模型，也不引入新图引擎。

## 2. 配方与边界

每服务最多20个当前可读且已挂载user库；配方最多8个命名需求分区、80个交付条目。分区具备id/name/mode/required/priority/query、可选单库、主题关系类型、实体种子、图谱关系类型、跳数/节点/关系限制和可选单库规则资产。必需意味着至少一个完整单元，不声称问题已被全面回答。任务查询最多250字符，固定查询词最多249字符，组合不超过底层500字符上限。

图谱上限1–3跳、2–100节点、1–100关系，继承底层预算和权限。固定配方不固定知识或访问权；回退配方不能恢复过期/撤回知识。规则仅支持现有受限单库确定性规则，推导与前提单独表达。

## 3. 证据与组装

- 原文单元保留精确文本、UTF-16位置、来源版本、SHA256及页码；原文不被标为已发布事实。
- 已发布关系单元携带两端实体、断言及证据引用；主题汇编与人工接受摘要按性质区分；推导携带规则版本和全部前提。
- 证据键使用库/文档/版本/哈希/start/end，相同证据跨分区共享，不将不同来源版本合并。引用性质（支持/反驳）保留在事实条目中。
- 必需分区先获得一次选入机会，再按优先级及稳定顺序填充。事实使用底层检索排名；分数只用于排序，不作可信度。
- 仅在整条知识及全部证据依赖能容纳时选入，不截断原文、不留下悬空引用。JSON完整响应的UTF-8字节为硬预算；不显示伪精确token数。
- 每分区返回候选/选入/预算排除/数量排除统计，以及当前后端提供的冲突、失效或截断限制。已知冲突不自动裁决。

状态：complete表示配置要求满足且未报告缺口；partial表示存在限制或允许的可选后端失败；insufficient表示必需分区无可交付条目；empty表示没有匹配条目且无必需项或后端故障。状态不代替业务质量裁决。

## 4. 当前权限与修订

开始与交付前复用当前本地角色、平台准入和库挂载校验，导出额外检查data.export；事实/原文需要ai.use。任何授权拒绝整体失败。可选后端故障只有allowPartial=true且非必需才允许降级；409修订变化整体重试，暂停不当作无知识。

当前状态指纹覆盖库状态、当前角色权限、文档/断言有效性、证据、实体、发布head、审核、主题摘要、身份治理、规则资产及消费开关；包含断言/文档到期和身份裁决时间窗口的当前布尔状态。每类最多5000行，超限明确拒绝，不静默截断。指纹不作为授权凭据，不承诺跨库全局快照。现有不可变发布与版本表继续作为版本权威。

## 5. 接口

管理：GET/POST /api/knowledge-services，现有命令不变，仅ServiceConfig新增可选context。声明context能力必须携带合法配方。

调用：POST /api/knowledge-services/invoke（RP）；POST /api/tools/knowledge_service（OBO，aud=karda、scope=tool:karda）。

示例请求：

```json
{"serviceId":"SERVICE_UUID","requestId":"NEW_UUID","capability":"context","query":"本次任务问题","taskId":"caller-task","runId":"caller-run","previousRequestId":"OPTIONAL_PREVIOUS_UUID","export":false}
```

requestId不可复用；query必填；taskId/runId均由调用方声明，非外部平台认证身份。draft=true仅允许Karda配置管理者。previousRequestId只可读取同服务、同用户、同调用产品的成功上下文元数据。不同任务输入指纹标记为不可比较。

响应沿用knowledge-service-result.v1外层，result为task-context.v1：goal/status/sections/items/evidence/selection/revision/fingerprint/diff/budget/untrustedContent。diff只输出新增、移除、未变数量，不重新暴露旧包失效条目的正文或身份。

## 6. 审计与计量

0047迁移只扩展knowledge_service_call的capability约束并新增context_metadata JSONB，保持102表，Prisma与baseline及列级权限镜像同步。context_metadata只保存任务输入哈希、当前修订、条目/证据哈希及状态；不存任务文本、来源正文或taskId/runId原值。

每分区检索复用现有计量，幂等键为knowledge-service:requestId:sectionId:tool；同一工具多个分区不互相吞计量。外层不再重复计费。追踪记录实际步骤、HTTP状态、服务版本、输出字节和下游usage引用。中断running不自动重放。

## 7. 页面使用与导出

入口/channels/context；与/channels/services共享服务列表、表单、不可变发布/停用/回退和历史。新配方可选择已挂载库、需求分区、实体、预算，完成保存→预览→发布后调试。

调试展示分区状态、知识性质、证据索引、完整来源位置、预算排除、差异及JSON。导出JSON和复制文本均重新发起当前核验调用并检查data.export，不直接导出旧缓存。外部副本无法远程撤回，使用前调用方必须重核验。来源和模型文本均为不可信数据，不作为指令执行。

刷新、修改或失败清空旧响应；真实空态不使用演示数据。配置导出不含令牌。外部Agent生产联调、真实业务质量和性能不以本批隔离验收代替。

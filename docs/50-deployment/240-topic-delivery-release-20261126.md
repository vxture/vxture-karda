# 当前主题知识交付阶段（2026-11-26）

## 1. 集中交付

[PR348](https://github.com/vxture/vxture-karda/pull/348)交付当前主题证据汇编及显式选择的人工认可摘要 JSON/Markdown，主题页实体可定位知识页和图谱。两类材料分别标记 `extractive_compilation` 与 `human_accepted`，包含库/主题/指纹/检查时间、精确来源版本、UTF-16 坐标和 PDF 物理页。

导出在同一 repeatable-read 事务中重验当前准入、所有者、读取/发布/导出权限、挂载、发布事实、来源版本和最新裁决；可按 ID 读取超过最新 20 条窗口的旧摘要。过期、截断、待审/拒绝/需修改、无效引用或超 2MiB 均拒绝。无新 DDL、依赖或模型调用，不自动发布，不代表签名或持续授权。

## 2. 阶段验证

开发仅 3 项导出定向测试（复用夹具带 2 项既有测试）、类型/i18n/文档守卫和一次集中 Playwright 页面验收，未重复本地全量。阶段 CI [45658042998](https://github.com/vxture/vxture-karda/actions/runs/45658042998) 共 1086 项通过、零跳过；安全扫描成功。真实 PostgreSQL SOP 覆盖认可后导出、105 条历史摘要精确旧 ID/最新裁决、未知 ID、来源变化失效及只读拒绝。

## 3. 发布状态

PR348 合并为 `79466f7a8a08e2f25904378ba595363ef7b96de1`。主干 CI [45658684451](https://github.com/vxture/vxture-karda/actions/runs/45658684451) 与扫描 [45658684126](https://github.com/vxture/vxture-karda/actions/runs/45658684126) 成功。标签 `v0.12.22` 经正常 production 审核部署 [45659213275](https://github.com/vxture/vxture-karda/actions/runs/45659213275) 成功。

线上验证：`/api/health`、`/api/ready` 返回 v0.12.22/79466f7a/production，db、redis、storageConfig 均为 ok；主题 JSON 导出与知识包匿名请求均 401。回滚目标为 v0.12.21/f1bfccba。未读取客户资料或自动重处理。

## 4. 剩余门槛

固定 17 项仍为 7 项完成、10 项未完成。真实 Agent 联调、模型账单与摘要质量、业务复核、实际规模及本体/平台外部契约继续独立验收；I1 继续暂缓。

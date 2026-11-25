# DOCX引用附属正文来源阶段（2026-11-25）

## 1. 集中交付

[PR344](https://github.com/vxture/vxture-karda/pull/344)集中交付DOCX正文/普通表格及明确引用的页眉、页脚、脚注、尾注来源链。
新docx-referenced-stories-v3按节类型/part路径及附注ID标注，正文保留引用标记；不伪造物理页码/继承/视觉顺序。动态域/图片/隐藏/修订/自动编号/复杂或错配引用仍拒绝。
旧离线入口和v1/v2快照保持；镜像/分派/版本注册及0024格式CHECK同步，0023全重放保护，55表/字段/权限不变。不自动重新处理客户资料。
设计与预算见[170 §43](../30-design/170-semantic-persistence-adapter.md)。

## 2. 阶段验收

开发期仅9项来源检查、类型/数据/i18n/文档守卫，无本地全量或无关浏览器流程。
PR CI45643421763一次1077项全部通过、零跳过。包含真实DOCX附注规范化/分块/Prisma提交/编译/人审发布/知识包精确附注证据/原文搜索/撤回/字节变化/晚期失败回滚；新库和旧41库重复迁移、已有v3快照后全套重放。
独立运行目录可加载新脚本及旧解析辅助，镜像契约检查同步。主干e4ffcda902b75a29107dd321e41e5356dabe5186。

## 3. 生产记录

主干CI45644097375及扫描45644097521通过，固定e4ffcda902b75a29107dd321e41e5356dabe5186发布v0.12.20。
[生产迁移45644527356](https://github.com/vxture/vxture-karda/actions/runs/45644527356)经原production审核于北京时间23:25:22成功，0024已应用，55张声明表全部存在。
[部署45645219718](https://github.com/vxture/vxture-karda/actions/runs/45645219718)经原production审核于北京时间23:33:44成功。正式health/ready确认v0.12.20/e4ffcda9/production及db/redis/storageConfig均ok，匿名compile-tasks/knowledge-package GET和source-search POST均401。
应用回滚目标v0.12.19固定1fbdf09c23d7030e46ec1212153f4207243013b2；保留兼容新增格式CHECK，不向下迁移或自动处理客户资料。合成资料/模型和匿名探针不接受为客户业务质量或真实Agent验收。

## 4. 剩余范围

固定17项仍7完成/10未完成。K2a来源子项交付；OCR、动态页码域/自动编号/复杂Office、真实Atlas账单/Agent/本体权威、实际负载及独立业务切换仍开放，I1暂缓。

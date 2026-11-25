# Office来源覆盖与版本契约统一阶段（2026-11-25）

## 1. 集中交付

[PR332](https://github.com/vxture/vxture-karda/pull/332)集中交付PPTX作者幻灯片文字/矩形表格、格式版本清单、镜像/编译入口、数据库格式约束和支持范围文案，主干52d538a。
PPTX按presentation顺序，规范正文保留Slide/shape/paragraph或table/row/C列标识；Unicode和原件/正文hash、UTF-16偏移沿用固定快照，不把幻灯片号当PDF页码。
包内形状顺序不是视觉阅读顺序，只提取本幻灯片作者文本，不使用母版/布局占位提示，不声称完整视觉理解。复杂图片/图表/组合/连接线、备注文本、隐藏内容、外链/字段/宏/动画、合并表格及不确定结构拒绝。
统一source-formats清单供快照兼容校验、当前运行格式、编译来源选择；契约检查同步Python分派、镜像COPY及数据库允许版本，保留旧PDF/DOCX/XLSX快照。
0023扩展格式CHECK，0022保护完整重放不收窄PPTX版本，表数/授权保持55；不自动重新处理客户资料。
设计及预算见[170 §37](../30-design/170-semantic-persistence-adapter.md)。

## 2. 阶段验收

开发中只来源相关7项检查、类型/i18n/数据/文档守卫，无本地全量重跑或无关浏览器流程。
PR CI45600253495一次通过，1056项全部通过、零跳过；包含真实PPTX规范化/分块/Prisma保存/编译/审核发布/知识包与原文检索/撤回/原件变化/晚期失败回滚。
新库与旧41表库重复迁移，已有DOCX/XLSX/PPTX快照后全重放仍保留新旧行，独立运行目录能加载镜像解析器。

## 3. 生产记录

主干52d538ad039589b799543ab7fe71f4de5e82b165，CI45600733220及扫描45600733050成功。
[生产迁移45601170149](https://github.com/vxture/vxture-karda/actions/runs/45601170149)于北京时间19:06:53成功，0023已应用、55张声明表确认存在。
固定上述主干发布v0.12.14；[部署45601558941](https://github.com/vxture/vxture-karda/actions/runs/45601558941)经原production审核于北京时间19:27:45成功。
正式health/ready确认v0.12.14/52d538ad/production及db/redis/storageConfig均ok；匿名compile-tasks、knowledge-package GET及source-search POST均401。
应用回滚目标v0.12.13固定a2fdf7cbda8dda4ef5c9357d1cd5565fd7c3c42b；保留兼容的新增格式约束，不执行向下迁移或自动处理客户资料。
代码及合成数据通过不等于生产业务或真实模型/Agent验收。

## 4. 剩余范围

固定17项仍7完成/10未完成，来源阶段子项交付。扫描/OCR、复杂Office/视觉结构、真实Atlas账单、Agent/OBO及平台/本体权威、真实负载与独立业务切换仍开放。
继续大阶段集中开发、定向检查与阶段末验收/发布，I1保持暂缓。

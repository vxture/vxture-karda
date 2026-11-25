# 知识页与图谱同步消费阶段（2026-11-25）

## 1. 集中交付

[PR340](https://github.com/vxture/vxture-karda/pull/340)集中交付两页共享KnowledgeWindowClient、显式核验/观测状态、entity深链接和双向定位。
仅保留每组件单窗口内存基线，未变确认后才复用；核验期间隐藏旧图/证据，空替换/错误清空，Abort和序号阻止迟到响应。没有持久缓存、自动轮询或离线租约。
当前有效实体才能互链，服务端校验UUID并重建组件；跨页独立当前授权读取，Markdown导出保留原独立data.export校验。
设计见[170 §41](../30-design/170-semantic-persistence-adapter.md)。无新API/DDL/依赖，55表保持。

## 2. 阶段验证

开发期仅4项窗口协议/取消/错误/深链接定向、类型/i18n/文档守卫，无本地全量。
集中Playwright合成HTTP通过两页实体定位、unchanged/known_revision、核验期间隐藏旧证据、来源撤回清空/旧链接移除、409目录重启、403清空和390px。浏览器发现原生fetch调用绑定问题，修复后复验通过。
PR CI45626061515一次1071项全部通过、零跳过；主干ebe5cae02a86f7e05bead2a7b87ca214cb37ed30。合成页面及数据库回归不接受为真实Agent、业务质量或外部权威验收。

## 3. 生产记录

主干CI45626466725及扫描45626466718通过，固定ebe5cae02a86f7e05bead2a7b87ca214cb37ed30发布v0.12.18。
[部署45627063854](https://github.com/vxture/vxture-karda/actions/runs/45627063854)经原production审核于北京时间21:54:06成功。正式health/ready确认v0.12.18/ebe5cae0/production及db/redis/storageConfig均ok；匿名实体同步、满预算目录同步及Markdown导出均401。
应用回滚目标v0.12.17固定e9232509ce5bdb0c8223ec5b0396d81e310b803d；无DDL、55表保持。不读取客户资料、不自动触发模型或业务裁决；匿名保护探针不替代真实业务权限或Agent验收。

## 4. 剩余项

固定17项仍7完成/10未完成；本轮K2b/K3消费闭环子项交付，真实Agent/本体/模型账单、复杂来源、规模与独立业务切换门槛保持开放，I1继续暂缓。

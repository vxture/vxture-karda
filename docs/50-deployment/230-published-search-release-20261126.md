# 已发布事实检索阶段（2026-11-26）

## 1. 集中交付

[PR346](https://github.com/vxture/vxture-karda/pull/346)实现OBO only karda.published_search、RP API及/facts页面，图谱/知识页入口一起交付。
正式读取器先核验权限/挂载/当前审核发布/来源hash版本/精确证据再做有界BM25排序；全集是当前合格关系而非目录首页。结果带方向/断言/原文坐标、合格/命中/返回计数，分数只用于本次排序。
沿用karda.search计量，失败不交付正文；无模型回答、图扩展或本体推理，不改变旧search/source_search/知识包/同步工具。16项工具接口登记同步，55表无DDL。
设计见170§44。真实Agent/业务/本体质量验收仍开放。

## 2. 已完成验证

开发仅4项事实检索及17项工具目录定向、类型/i18n/文档守卫，无本地全量。TopK测试用例的单词只命中一条，改为多命中查询后复验通过。
集中Playwright合成HTTP通过精确证据/页码、实体定位链接、来源HTML转义、390px及空结果/403清空。
PR CI45650702642在b27d19c98e716e7990b44e584891402d14809e94全部1081项通过、零跳过；扫描45650702435成功。真实PostgreSQL SOP验证当前发布命中、类型过滤、来源版本变化排除、新审核发布命中、attachment撤回排除及角色拒绝。

## 3. 发布状态

GitHub写接口恢复，PR346已合并f1bfccba61d36b7c6b223752edcd808e8e666121。主干CI45653033266和扫描45653035858成功，固定该提交启动v0.12.21发布。无DDL、不需db-init。
[部署45653602000](https://github.com/vxture/vxture-karda/actions/runs/45653602000)经正常production审核于北京时间2026-11-26 00:31:08成功。health/ready确认v0.12.21/f1bfccba/production及db/redis/storageConfig均ok，匿名published-search POST和knowledge-package GET均401。
应用回滚目标v0.12.20固定e4ffcda902b75a29107dd321e41e5356dabe5186，55表保持；未读取客户资料，不把合成验收/匿名保护探针记为真实Agent或业务验收。

## 4. 剩余门槛

固定17项仍7完成/10未完成，真实Agent/业务质量、本体/平台权威、复杂来源和实际负载独立验收。I1继续暂缓。

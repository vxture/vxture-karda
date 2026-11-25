# Agent当前知识窗口同步阶段（2026-11-25）

## 1. 集中交付

[PR336](https://github.com/vxture/vxture-karda/pull/336)集中交付RP knowledge-sync、OBO only karda.knowledge_sync、版本指纹及消费者接入/失效协议。
同一正式读取器每次重新核验当前权限、调用产品attachment、来源版本/hash/精确证据和审核；命中known_revision也不绕过读取。指纹绑定身份、显式范围、窗口查询和实际知识，时间戳不造成版本抖动。
replace必须原子替换完整窗口（包含空知识），unchanged省略正文；任何错误清空旧结果，409重启分页；没有离线授权租约、事件推送或跨页原子快照。工具目录15项，Runos service通道不扩展。
设计/示例及接入顺序见[170 §39](../30-design/170-semantic-persistence-adapter.md)。无新DDL、依赖、模型调用或计量，55表保持。

## 2. 阶段验证

开发期仅4项同步契约和17项工具目录定向守卫、类型/i18n/文档检查，无本地全量或无关浏览器流程。
首次CI接口登记守卫发现新增工具漏记权威表，补齐260登记；最终PR CI45613942450共1064项全部通过、零跳过。
真实PostgreSQL SOP链覆盖首次replace/unchanged、来源版本变化空替换、新人审发布替换、挂载撤销/恢复、当前平台准入拒绝及归档清空。合成模型及资料只验证本仓同步行为，不接受为真实Agent/OBO、外部事件投递或业务质量。

## 3. 生产记录

主干47e39dbc9d67e7767d9bb66a73475d7ea434ff68，CI45614436808及扫描45614436654通过后固定发布v0.12.16。
[部署45614811554](https://github.com/vxture/vxture-karda/actions/runs/45614811554)经原production审核于北京时间20:40:14成功。正式health/ready确认v0.12.16/47e39dbc/production及db/redis/storageConfig均ok。
匿名knowledge-sync首读/带known_revision及knowledge-package均401；未读取客户资料或真实委托数据，不以匿名拒绝接受为真实Agent/OBO验收。
无DDL、55表保持；应用回滚目标v0.12.15固定8d2e992be8831b6fb7d8b6e007485f5ebb92b490。不自动开启客户端轮询或外部同步。

## 4. 剩余项

固定17项仍7完成/10未完成。本轮交付K2b/K5当前窗口同步子项；真实Agent接入、外部事件消费者、Ontos/平台权威、复杂来源、真实负载与业务门槛仍开放，I1继续暂缓。

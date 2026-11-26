# 多库读取分阶段诊断与性能阶段

日期：2026-11-26。K2b/K3b本仓性能建设，真实业务/全系统规模门槛不自动关闭。

## 1. 已完成

内部8段壁钟观测、可选2–30轮CLI、CPU样本摘要；规范化遍历减少临时数组/排序、复用刚准备命令；正式loader合并各库权威表查询，仍逐库检查冻结发布/编译/本体/支持/来源/裁决，保持现行授权与原件核验。没有DDL、跨请求缓存、模型或客户状态变化。

[194诊断原始样本](194-read-phase-baseline-20261126.json)采用2轮与CPU profiler，只用于定位热点；[195 CPU摘要](195-read-cpu-summary-20261126.json)包含setup和idle，不是请求独占CPU。原始cpuprofile在仓库外，摘要不包含机器文件目录。4800条单请求发布校验阶段约900ms，并发约2.6秒；排序阶段约55ms。canonical及临时对象为CPU热点。

[196最终报告](196-read-phases-batched-20261126.json)默认10轮、并发4为40样本。当前环境与前轮均为Windows/i5-10400/12逻辑CPU/约32GiB、Node24.14/PostgreSQL18.6、内存对象/已准入平台回调。JSON指纹格式/算法、描述符与循环/预算检查保持。接口响应没有phase字段，诊断异常不影响授权或知识交付。

## 2. 最终观测

| 场景 | 操作 | 并发 | P95 ms |
| --- | --- | --- | ---: |
| one-library-100 | directory | 1 | 34.4 |
| one-library-100 | directory | 4 | 90.5 |
| one-library-100 | facts | 1 | 32.2 |
| one-library-100 | facts | 4 | 71.9 |
| one-library-400 | directory | 1 | 78.6 |
| one-library-400 | directory | 4 | 215.7 |
| one-library-400 | facts | 1 | 82.1 |
| one-library-400 | facts | 4 | 219.5 |
| twelve-libraries-4800 | directory | 1 | 692.6 |
| twelve-libraries-4800 | directory | 4 | 2397.7 |
| twelve-libraries-4800 | facts | 1 | 690.3 |
| twelve-libraries-4800 | facts | 4 | 2526.6 |

4800条目录全覆盖、无重复；撤回旧游标拒绝、来源证据清除、挂载减少后的合格计数4000均通过。1000条单发布仍按publication_payload_limit拒绝，不抬高预算。

最终4800事实单请求P95约690ms，4并发约2527ms；相比前阶段192的782/9993ms，数值有改善，但诊断基线2轮含profiler，历史两轮有显著环境波动，不是配对/随机交替显著性实验。只能报告观察，不能宣称生产SLA通过。并发仍超过700ms，K2b/K3b规模门槛未通过。

phase为壁钟包含IO与调度、不同请求汇总，分段P95不能相加。没有控制OS/数据库冷缓存，首个观测不等于冷启动。未测RP/OBO网关/网络对象存储/浏览器首屏/真实Agent或模型。并发仍需进一步处理发布校验CPU和进程调度，不能通过缓存跳过现行权威检查。

## 3. 验证与剩余

开发17项发布/格式/检索/容量定向和类型通过。阶段统一真实服务角色容量，CI负责完整数据库发布/损坏/来源/裁决回归与8阶段/诊断隔离，无本地全量重复。
固定17项7完成/10未完成：进行中K0b、K1b-P5、K2a、K2b、K3b、K5；待门槛K4a、K4b、K6a、K6b。下一步处理多库并发剩余CPU开销，再测真实网关和业务规模；I1继续暂缓，外部Agent/Ontos/业务人审独立留证。

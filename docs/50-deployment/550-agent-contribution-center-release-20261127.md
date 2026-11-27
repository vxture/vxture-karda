# 智能体知识贡献与反馈中心发布记录

智能体知识贡献与反馈中心整板块完成：C1–C6及集中验证上线、逐项确认汇报共8项。

- C1 OBO贡献API/工具：新增、纠错、补证、失效建议，任务/运行/用户/产品追溯、幂等和CAS。
- C2 来源/证据：当前同库document/version/hash/UTF-16坐标，inline产物及受控file_ref，复用上传/配额/加工。
- C3 实体/别名/canonical匹配、重复贡献/事实及纠错目标对照；歧义不自动合并，关联知识变化仍可查询反馈。
- C4 收件箱、分派、待补充、不可变重提、采纳/修改采纳/拒绝/撤回；围栏恢复交接到真实production草稿计划，明确启动及既有事实审核发布。
- C5 当前生产阶段、发布版本/来源失效及关联事实反馈；contribution.changed持久元数据事件和可靠fanout。
- C6 工作台/管理API、历史/证据/生产/图谱入口和Agent接入示例导出。

入口 /assets/:kbId/contributions；Agent karda.knowledge_contribution（认证OBO）；file_ref={document_id,version,content_hash}，不接受URL/任意对象路径。

PR397合并b38ca071251f82b61d9ff5d93efc566ba51d5e69。最终CI45986524198/扫描45986524137：1189应用+7Java零失败/跳过；精确主干CI45986960114/扫描45986959436通过。首轮3项旧工具/事件契约验收未加新增能力，已补清单及真实反馈fanout验收；新增贡献正式发布流程首轮即通过。

0045迁移45987407855于2026-11-27 19:05:22 Asia/Shanghai成功，97/97表。部署45987716618于19:15:31成功。线上health/ready确认v0.12.54/b38ca071，db/redis/storageConfig/jena均ok。匿名贡献GET/POST及Agent工具POST401，页面307。

边界：首期同空间已挂载user库，贡献工具只OBO；任务/运行标识为调用方声明。采纳不等于正式事实发布，关联生产发布结果与具体当前事实分开。纠错/失效建议不会自动修改原事实，已发布知识仍通过治理处置；撤回贡献不删除正式知识。Runos既有service MCP不伪造用户，真实外部Agent/浏览器视觉点击/业务质量及机构授权独立待验。没有本地子进程/CMD/服务/浏览器/全量或性能测试。

清单 docs/70-workplan/206-agent-contribution-center-20261127.md；发布记录 docs/50-deployment/550-agent-contribution-center-release-20261127.md。应用回退基线v0.12.53/4d328714，新增表/审计保留。能力路线剩4未批准模块：自动连接器、本体建模、任务上下文、多模态理解。固定17主验收仍7完成/6进行中/4门槛，I1暂停。

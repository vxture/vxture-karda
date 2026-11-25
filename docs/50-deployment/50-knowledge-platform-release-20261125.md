# 知识平台增量发布记录（2026-11-25）

本文件保留v0.12.0历史发布证据；当前v0.12.1及最新执行项数量见[后续批量发布](60-knowledge-exploration-release-20261125.md)。

owner 于 2026-11-25 授权完成建设并上线；本记录区分代码发布、生产迁移与业务验收。
完整功能进度以[17 项执行清单](../70-workplan/120-rebuild-execution-checklist-20261124.md)为准，不能用应用上线代替 K0–K6 整批验收。

## 1. 固定版本与发布流程

- 目标版本：`v0.12.0`，固定应用提交 `c6ab332097826daa0f41750ebf7f4656cadcbd1e`。
- 主干 CI [45483291937](https://github.com/vxture/vxture-karda/actions/runs/45483291937) 及秘密扫描 [45483291372](https://github.com/vxture/vxture-karda/actions/runs/45483291372) 成功。
- PR301 的测试实际执行 1019 项，全部通过、零跳过；主干检查通过后才推送发布标签。
- 部署 run：[45483761795](https://github.com/vxture/vxture-karda/actions/runs/45483761795) 成功，使用既有 tag 构建、生产环境审核和 worker-02 部署流程。镜像构建于 2026-11-24 20:47:53 UTC 完成，生产部署于 20:49:34 UTC（北京时间 2026-11-25 04:49:34）完成。
- 发布前线上版本：`v0.11.9`，提交 `9094cbd4db6299c77de4638c5998e9212b632420`；保留该固定提交作为应用回滚目标。

## 2. 生产数据库

两次迁移均经既有 db-init 及生产环境审核成功执行，没有改客户权限或平台配置。

| 迁移 | 固定提交 / run | 实际结果 |
| --- | --- | --- |
| 0016 / 0017 | `03baaa63d419db5c1c3b20935fe9f4dee17e4f31` / [45474033618](https://github.com/vxture/vxture-karda/actions/runs/45474033618) | 声明表从 41 → 52 |
| 0018 | `dea50df3b0d38c8c2de1178a30a3a101d72288fb` / [45482679667](https://github.com/vxture/vxture-karda/actions/runs/45482679667) | 日志确认应用 document_text_snapshot 迁移，53 张声明表全部存在，db-init done |

0018 快照仅允许服务角色插入和读取，与分块/活动版本同事务提交。应用回滚保留这些增量表，不逆向删除数据。

## 3. 本次发布的功能范围

- 持久编译任务、租约执行/重试、候选冲突选择、逐关系审核、绑定指纹预览及单独确认发布。
- 正式发布到授权知识包、OBO 知识工具、实体知识页、目录/正反链接与服务端 Markdown 导出。
- 正式知识包驱动的大幅图谱，缩放平移、关系筛选、局部展开、路径发现与原文证据；当前有界圆形布局最多 500 节点 / 1000 边。
- 来源版本/撤回影响、关系证据和审核变化体检，问题/来源筛选及编译审核入口。
- 文字层 PDF / 基础正文 DOCX 的不可变规范化文本、哈希、UTF-16 坐标和 PDF 物理页证据，连接处理、编译、发布、知识页、图谱及体检。
- 独立运行目录下的真实解析器定位回归；Python 和 hash 固定解析依赖随 Karda 镜像交付。

代码依据：[PR298](https://github.com/vxture/vxture-karda/pull/298)、[PR299](https://github.com/vxture/vxture-karda/pull/299)、[PR300](https://github.com/vxture/vxture-karda/pull/300)、[PR301](https://github.com/vxture/vxture-karda/pull/301)；合同与限制见[170 §10–18](../30-design/170-semantic-persistence-adapter.md)。LLM Wiki 仅借鉴理念，无 GPL 代码复制。

## 4. 验证范围与未完成门槛

发布后于 2026-11-24 20:50 UTC（北京时间 2026-11-25 04:50）直接读取正式域名，未附任何会话或 Bearer：

| 探针 | 实际结果 |
| --- | --- |
| `https://karda.ruyin.work/api/health` | 200，status=ok，version=v0.12.0，gitSha=c6ab3320，stage=production |
| `https://karda.ruyin.work/api/ready` | 200，status=ready，同版本/SHA，db/redis/storageConfig 均 ok |
| `GET /api/kb/:id/knowledge-package` | 401，只有 unauthenticated 错误 |
| `GET /api/kb/:id/knowledge-package?format=markdown` | 401，只有 unauthenticated 错误 |
| `GET /api/kb/:id/semantic?view=maintenance` | 401，只有 unauthenticated 错误 |
| `GET /api/kb/:id/compile-tasks` | 401，只有 unauthenticated 错误 |

拒绝探针使用固定不存在的 UUID，不探测客户资产。不以匿名检查证明已登录权限隔离、真实生产解析或完整业务链路；此前的 PostgreSQL/真实解析器回归和浏览器合成流程也不是已登录生产业务验收。

固定 17 项仍为 6 完成 / 6 进行中 / 5 待办，共 11 项未完成。K0b owner 人审及独立留出、真实 OBO/Agent/Atlas 账单、tenant/platform/预设库与跨库、真实 Ontos 规则仍待相应证据。
原文检索模式、主题页合成、聚类/版本对照、规模验收、草稿/差量刷新/完整审计重放及第二场景仍待建设或验收。
扫描/OCR、复杂 DOCX 和其他 Office 未支持。未宣布质量达标、真实客户迁移或 K6 业务切换完成；I1 继续按用户决定暂缓。

## 5. 回滚

如本版应用验证失败，使用既有 `rollback.yml`，固定上一版应用提交 `9094cbd4db6299c77de4638c5998e9212b632420`，保留生产审核，再核对健康、就绪、版本与依赖。
不移动或重写已发布标签，不删除增量表，不改平台服务器或客户权限。

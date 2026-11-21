# Karda 整改批次跟踪

建立日期：2026-11-22。每个批次分别记录实现、CI、部署和真实验收，不能以合并代替上线。本文是本轮有序批次的唯一跟踪表，历史阶段记录见 10-platform-alignment-20261122。

## 总表

| 批次 | 范围与交付 | 状态 | 依据 / 退出条件 |
| --- | --- | --- | --- |
| P0 | 当前版本及接口盘点；退出最小修正；依赖审计修复 | **已合入，未部署** | PR207 / ecc382d；805 项本地测试及最终 CI 通过；线上仍 v0.10.3 |
| P1 | Accounts 会话正确性：刷新互斥、防复活、状态检查兜底、故障语义 | **实现及 CI 验证完成，未部署** | [PR208](https://github.com/vxture/vxture-karda/pull/208) 跟踪合入；815 项测试含真实 Redis 无跳过，生产/真实 Accounts 验收仍待执行 |
| P2 | S2S、C2 准入及额度池 | **已合入，未部署** | [PR209](https://github.com/vxture/vxture-karda/pull/209) / d342a2a；822 项测试及全部必需 CI 通过；真实平台验收待 P9 |
| P3 | 生命周期、通知与配置对账 | **已合入，未部署** | [PR210](https://github.com/vxture/vxture-karda/pull/210) / 0e4f643；837 项含真实 PostgreSQL 测试、全部 CI 通过；需先 db-init 0010 |
| P4 | C3 持久用量与自动排空 | **已合入，未部署** | [PR211](https://github.com/vxture/vxture-karda/pull/211) / bf948da；841 项测试和全部 CI 通过；需先 db-init 0011；真实 C3 待 P9 |
| P5 | Atlas 现行契约与知识链路 | **已合入，未部署** | [PR212](https://github.com/vxture/vxture-karda/pull/212) / 35d33ae；845 项及全部 CI 通过；线上契约及真实知识链路待 P9 |
| P6 | Karda 独立页面设计与入口实施 | **已合入，未部署** | [PR213](https://github.com/vxture/vxture-karda/pull/213) / 43004f1；847 项及全部 CI 通过；CoSpace v1.3.1，独立 Karda 图形/背景，保留 Ruyin/版权及 ShellViewport |
| P7 | 浏览器消息同步 | **已合入，未部署** | [PR214](https://github.com/vxture/vxture-karda/pull/214) / d216861；851 项及全部 CI 通过；同事务 outbox、共享版本、SSE；需 db-init 0012；平台身份通知缺口 issue726 |
| P8 | 成本、套餐与产品配置 | **登记基线已核对，容量/定价待完成** | 整包成本和贡献率、公开关键指标、内部额度映射；用户确认后发布套餐/域名/终端配置，不复制 Arda 参数 |
| P9 | 实际发布通道及业务验收交付 | 待开始，依赖候选范围前序完成 | 实际仅 production，TD-001 尚无 beta；候选须经完整 CI、db-init 与生产人工审批；登录退出隔离、知识链路/计量及清理；不声称 beta 验收 |

顺序代表实施主线，不要求为做页面而等待所有商业决策；独立的只读核查可交错推进。若拆 PR，采用 Pn.1/Pn.2 子批次，保留主批次号，不悄悄缩小验收范围。生产推广应按验证过的候选和上线风险分阶段规划，不因表内编号自动发版。

## P1 当前记录

### 实现及验证记录

- Redis 共享刷新锁，等待后重读会话；12 秒等待上限、30 秒租约，所有刷新写回校验锁 owner，避免旧持有者越权写回。
- 更新采用 Lua 条件写：会话仍存在、旧 access token 一致、sub/sid 未变；KEEPTTL，不延长 RP 生命周期。会话被删除或自然过期后不得写回。
- 主动退出单会话删除与索引清理原子执行；后端退出对同一 sid 的全部 RP 会话原子撤销。刷新与删除由 Redis 串行化，迟到写回无法复活会话。
- 刷新返回先验签，再校验 sub/sid、整数且未来的 exp、角色/范围字段；以签名 exp 为有效期，不信任 expires_in 延长权限。回调同样使用签名 exp。
- 普通服务端请求仅在 Accounts 返回的 next_check_at 到期后查询状态，active:false；只有成功响应明确 valid:false 才撤销。无新增浏览器轮询、focus 查询或后台假活动。
- refresh、Accounts、Redis 或验签失败不能证明中央退出。统一将未知会话返回 503；无会话才返回 anonymous/401。身份和准入 JSON 加 no-store；实际业务接口仍 fail closed。
- 本地退出删除失败返回 503，不清 cookie 并宣称已成功退出。令牌交换请求有超时且不跟随重定向，错误不回显对端响应正文。

### 验收及未覆盖范围

本地针对性 13 项测试通过，含真实隔离 Redis：6 个并发消费者仅刷新一次、全部 sid 会话撤销、过期不能复活、TTL 不增长、过期锁 owner 被拒绝；单元回归含身份污染、迟到验签、Accounts 不可用与明确退出。CI 新增 Redis 服务，测试只允许显式配置的 loopback DB15，随机前缀清理，不 FLUSHDB。未配置时本地可跳过隔离测试，CI 必须配置并实际运行。

全套本地 815 项测试通过、无跳过；本地依赖更新后先生成 Prisma Client，TypeScript 检查通过。正式构建及所有必需门禁继续由本批 CI 验证。所有测试使用本地模拟 Accounts 响应，未请求真实平台来伪造用户活动。

CI [44929659588](https://github.com/vxture/vxture-karda/actions/runs/44929659588) 的完整构建、815 项测试、审计、静态检查和质量门禁全部通过；真实 Redis 用例运行，skipped=0。对应密钥扫描通过。此后跟踪文档更新仍须通过 PR 最终门禁后合入，不推送发布标签。合入结果以 PR208 状态为准；生产仍 v0.10.3，不把“实现验证完成”当作线上验收通过。

尚未执行真实生产/Accounts/运维隔离验收。中央状态检查不携带组织空间变更，P1 不把它当作上下文同步消息。实际身份范围变化通过受控 refresh 生效，旧界面和缓存的范围清理由 P6/P7 处理；不新增产品端临时猜测的授权事件。用户活动/空闲策略需继续核对上游，不通过心跳或检查伪造活动。

## P2 当前记录

- C2/C3 与 Atlas 使用产品自己的 OIDC 机密客户端通过 Basic RFC8693 换取票据；共享平台 internal-auth 凭据已退出调用路径、示例配置和状态页。
- 票据必须通过 RS256/JWKS 验签，并核对单受众、act.sub=karda（beta 客户端也不能伪装成产品编码）、tool scope、mode、org/workspace、OBO 用户、无 delegated、整数 iat/exp 及最长 300 秒有效期。请求 8 秒超时且拒绝重定向；服务票据只按签名 exp 缓存，合并同范围并发换票；用户 OBO 票据不跨请求缓存。
- 前门、C2 查询与业务 HTTP 公共边界区分账号、产品分配、商业订阅；未分配产品不显示购买按钮。产品内部角色继续由既有本地授权处理，机器数据面保留 bundled 的独立判定。
- C2 返回必须与请求的 workspace/product 对应，必需授权字段及数值类型有效；未知新增字段仍兼容。用户准入不使用工作空间服务缓存；过期缓存不再掩盖平台故障，查询失败返回 503。事件失效采用代次阻止迟到请求回填。
- 部署态缺少配置必须报错，ALLOW_MOCK_ON_DEPLOY 不能替代商业授权；本地离线演示保留。产品编码固定 karda，与 OIDC 客户端名称分离。
- 额度池合计平台返回的同指标适用池，保留负余额，不再只取第一池。C3 这里只替换认证传输；持久 receipt、自动 worker 仍明确属于 P4。
- 后台租户范围来自已签名配置/对账落库的 AppInstance.tenantId，不信任请求体自报。历史空 tenantId 必须由 P3 对账修复；未完成之前后台调用拒绝，不猜测组织。

本地 TypeScript 检查通过；全套 822 项测试通过、无跳过，包含真实 Redis 及本地 RSA 签名/错误签名票据、scope/actor/租户污染、缓存失效竞争、过期失败、加油包次序回归。未请求真实付费推理、未修改平台配置、未部署；后续以 PR 门禁及 P9 真实验收补齐。

## P3 当前记录

P3.1：标准 webhook 路径及历史别名；HMAC 后绑定签名 body 与 delivery/event header；事件结构验证及 1 MiB 上限；版本通知分离；工作空间/投递锁；事务提交状态、水位、receipt；稳定载荷摘要拒绝 ID 冲突。不可改写 provision_anchor 修复历史空租户引用，不开放旧参考列 UPDATE。DDL 增量 0010 与 Prisma、权限同步，部署前须由 db-init 应用。

P3.2：独立 provisioning:read 票据、启动及每 5 分钟后台全量分页对账；缺行不删除、pending 不 ACK、较旧快照不能覆盖新状态、相同版本可修复 anchor。提交后 ACK、失败重试、响应范围验证。beta 只读对账，不应用无环境信息的生命周期通知；没有新增浏览器权限定时查询。

本地 837 项测试通过、无跳过，含真实 Redis 与 PostgreSQL 服务角色：并发投递只执行一次、事务回滚、版本乱序、通知不动水位、载荷冲突、旧快照不复活已停用空间、不可改写租户引用。TypeScript、DDL/Prisma/权限和工作流守卫通过。CI 增加隔离 PostgreSQL，以受控 DDL 初始化后运行相同测试。

平台 ACK 的在途旧版本竞态继续归 [issue720](https://github.com/vxture-platform/vxture-platform/issues/720)，本仓发送 detail.seq 不能替代平台原子版本校验。环境隔离已发送 [平台 issue724](https://github.com/vxture-platform/vxture-platform/issues/724)，不修改平台仓。多实例缓存失效仍属 P7。未执行现网 DDL、平台写配置或部署，不能把本地通过当成线上验收。

## P4 当前记录

文档/条目创建与 karda.ingest outbox 同事务；后续工具重放同 key 不重复计量，冲突 key 拒绝。报告 intent=report，只按有效 200 receipt 确认，409 和畸形成功保留；确认存储失败以原 key 重试。自动 worker 启动 2 秒后、每 30 秒最多 50 条，持久退避与失败摘要，最多 10 次自动尝试后保留并报告运维错误。生产缺配置或 DB 不回落内存。

本地 841 项通过、无跳过，含真实 Redis/PostgreSQL、内容与用量原子回滚、幂等冲突、退避持久化、回执后确认失败恢复。TypeScript、数据结构守卫通过。部署前需 db-init 0010/0011；未执行线上 DDL、付费调用或生产计量。细节与恢复规则见 280-durable-usage。

## P5 当前记录

从 Atlas main 的 contract/atlas-contract.json 更新 43 → 59 错误码，指纹 c1-ccd1b2cb48f8（仓库发布快照来源，线上指纹仍需验收）。覆盖 issue206 的 UPSTREAM_ACCOUNT_REFUSED：加工/提取驻留，面向管理员显示上游服务账户不可用，不误导去给产品授权；RATE_LIMITED 保留 retryable 语义。

共享 /v1 调用验证工作空间上下文、禁止替代路径/重定向，并设 120 秒上限；无范围不换票。重排拒绝非整数/重复索引与非有限分数，避免污染排序。示例配置更新为现有产品 endpoint 授权轴，移除已不用的 TASK_PROFILE 设置；不代授 Atlas 能力、不发付费请求。

本地 845 项测试通过、无跳过，含加工/提取错误、真实 Redis/PostgreSQL，契约守卫与 TypeScript 通过。CI 及实际知识加工/检索/重排/问答、真实 token 计量归属待后续候选验收。产品外观与订阅参数未混入该批。

## 跟踪规则

每批更新本表状态、PR/提交、测试证据、是否部署及遗留项。平台缺陷先检索现有 issues，只有确认对端缺口才发送脱敏详细 issue；本仓消费端问题先在本仓修正。涉及套餐/域名、付费推理、生产写入或发布时，按既有授权与人工门禁处理具体方案。

## P6 当前记录

独立 Karda 标记、知识书页图形及浅色网络背景；继承 CoSpace v1.3.1 共享布局与 Ruyin/法律信息。欢迎语/底部常驻，最小高度和背景装饰位置统一；不改 PortalShell。订阅改产品定价页，按管理资格显示；未分配产品、停用及未知状态不导向购买。重试合并请求，15 秒超时，不以 focus 或计时器重新查权限。

本地 Playwright 覆盖 1440/390/320px、五种状态，最小高度及图形中心符合规范，无横向溢出；focus/visibility 触发查询为零。6 项针对性测试及 TypeScript 通过；全量回归与 CI 继续执行。未发布、不修改规范或平台配置。细节见 290-public-entry。

## P7 当前记录

PostgreSQL 同事务 access_revision outbox，Redis 单调版本和原子推送；投递完成前通知失败保留重试，后台仅重试未发布记录，Redis 丢失版本从数据库恢复。共享版本阻止其他实例使用已失效 C2 服务缓存。RP 删除与退出通知同一 Redis 操作。SSE 同源会话鉴权，仅推送对应上下文失效，不传令牌或身份标识；保活不查询权限、不续活动。

本地 851 项通过、无跳过；含真实 Redis/PostgreSQL 的事务回滚、重复/乱序、断线补齐及旧回执不清除新版本。Playwright 验证首次核验一次、真实版本变化一次、相同版本重连及 focus 均零查询，撤销清理业务视图并回入口。类型及数据架构检查通过；需 db-init 0012，未部署。缺失的跨产品身份事件契约见 [平台 issue726](https://github.com/vxture-platform/vxture-platform/issues/726)，不假定平台已推送。细节见 295-access-events。

## P4.1 查询计量补查

补查发现 Agent 检索/问答仍吞掉用量存储错误。改为成功结果交付前持久记录，落库失败返回脱敏 503；无上下文问答仍不计业务调用，Atlas 继续负责模型/token 计量，检验台仍保持既定诊断口径。每次实际工具调用独立计数，outbox 重投复用已存幂等键。此补批不改套餐参数或增加重复 AI 扣费。

P4.1 本地全量 854 项通过、无跳过，包含用量存储失败拒绝成功结果、无上下文不计量和共享 dispatcher 脱敏 503；TypeScript 及全部 CI 通过，PR215 / 4e115e1 已合入，未部署。

发布事实修正：`.github/workflows/deploy.yml` 当前仅接 v*.*.*，GitHub 也只有 production 环境。TD-001 明确 beta 等待独立服务器，不得复制 Arda 目标；因此 P9 不创建空 beta 标签或宣称已 beta 验证。早期计划中的 beta→prod 是目标流程，不是当前已具备能力。


## P8.1 登记与容量复核

运维登录已完成。网页端已启用；Webhook 修正为正式域名 HTTPS 标准路径；Logo 改现行独立 Karda 资产。未变更域名、上游、密钥、权限范围或平台服务器变量。配置保存后回读确认，真实投递仍待 P9。公开仅邀请 Free，seat.max=1；本仓声明键同步 seat.max，不推测 paid 档位。

上线检查实际仍缺登录/C1/C3，C2 显示旧共享凭据；顶部全完成问题已由平台 issue719 覆盖。未勾选人工完成项。容量 helper 尚未接入业务写入，P8 不得宣称硬上限已执行；套餐发布需完成原子计数/预留及成本方案。完整交付记录见 [30-delivery-record-20261122](30-delivery-record-20261122.md)。

P8.1 本地全量 854 项通过、无跳过，TypeScript 通过；正式 CI 随本批 PR 验证。技术发布仍未执行，套餐仍未发布。

## P7.1 发布闸门补查

P8.1 已以 PR216 / 5c4a97f 合入，全部必需 CI 通过。发布前发现 P7 后 Redis 已是服务准入共享版本的必要依赖，就绪度仍沿用旧降级判定。补正 Redis 故障和部署态缺 DB/Redis 为 fail/503，离线缺配置仍兼容；不改 liveness、不调用付费模型探测。生产仍未部署。

P7.1 本地 856 项测试通过、无跳过，TypeScript 与严格文档编号检查通过。正式 CI 随独立补批执行。

# Karda 整改批次跟踪

建立日期：2026-11-22。每个批次分别记录实现、CI、部署和真实验收，不能以合并代替上线。本文是本轮有序批次的唯一跟踪表，历史阶段记录见 10-platform-alignment-20261122。

## 总表

| 批次 | 范围与交付 | 状态 | 依据 / 退出条件 |
| --- | --- | --- | --- |
| P0 | 当前版本及接口盘点；退出最小修正；依赖审计修复 | 已部署 v0.11.1 | PR207 / ecc382d；805项测试；发布run44945579438 |
| P1 | Accounts 刷新互斥、防复活、故障语义 | 已部署，真实验收待P9.2 | PR208 / 6984f47；815项测试 |
| P2 | S2S、C2准入及额度池 | 已部署，真实验收待P9.3 | PR209 / d342a2a；822项测试 |
| P3 | 生命周期、签名通知及配置对账 | 已部署，真实投递待验收 | PR210 / 0e4f643；837项测试；DDL0010已应用；线上对账scanned3/failed0 |
| P4 | C3持久用量、后台重试 | 已部署，真实计量待P9.3 | PR211 / bf948da及PR215 / 4e115e1；DDL0011已应用；历史无归属记录仍保留 |
| P5 | Atlas契约与知识链路 | 已部署，真实验收待P9.3 | PR212 / 35d33ae；845项测试 |
| P6 | Karda独立页面与统一入口布局 | 已部署，正式域名浏览验收待完成 | PR213 / 43004f1；本地1440/390/320px五状态通过 |
| P7 | 权限消息、共享版本与SSE | 已部署，跨产品消息待验收 | PR214 / d216861；DDL0012已应用；平台身份契约issue726仍开 |
| P8 | 容量执行、成本、套餐与产品配置 | 部分完成 | 域名七项登记已保存；仅Web；容量与价格仍在推进 |
| P8.3a | 知识库数量原子限制 | v0.11.2已部署，真实边界待验收 | PR221 / f8b3788；863项及全部CI通过；浏览器/Agent同事务限制；见300-capacity-enforcement |
| P8.3b | 文档/条目、连接器数量限制 | v0.11.2已部署，真实边界待验收 | 统一内容数量；连接器暂停占位/撤销释放；替换同事务、撤销防复活 |
| P8.3c | 存储容量预留与恢复 | v0.11.2已部署，真实恢复待验收 | DDL0013已由受审run44980689156应用，38表核验通过 |
| P8.3d | 存储共享池准入及绝对水位 | v0.11.2已部署；DDL0014已应用；真实水位待验收 | 持久水位快照和重试；新建字节按实际C2共享余量准入；不承诺跨产品全局原子预留 |
| P8.4 | 成本和套餐方案 | 四档公开发布；Free退役 | P8.9回读确认四档、年价和联系销售；指标展示待平台issue717 |
| P8.8 | 两产品套餐定稿v1 | 用户确认，四档已发布 | 20-specs/80及final-package-spec.json；价格199/499/1499，连接与服务20/100/500；执行、成本与平台草稿验收仍待完成 |
| P8.7 / W1 | AI工作量与积分测算 | 离线分析完成；未发布、未实施优化 | 20-specs/70：Arda任务目录仍空；Karda当前/优化成本分别计算；W2–W5检索评测、任务预算、Arda任务与商业校准待完成 |
| P8.6 | Arda/Karda联合定价复核 | 已完成设计定稿，见P8.8；未改线上草稿 | 20-specs/60：统一成本输入、三种情景、双订/混档/扩展整单；真实成本与平台能力待校准 |
| P9 | 生产发布与业务验收交付 | v0.11.2已部署，验收未完成 | 1a59f0e；run44997013773；新旧域名ready均通过；旧域名待退役 |
| P9.1 | 新域名生效、旧域名退役 | 新域名可达；旧域名退役待平台 | 浏览器新域名ready通过，回调通过；issue727；未改服务器变量 |
| P9.2 | Accounts登录退出、权限同步 | 新域名登录回调及C2通过；退出和消息待验收 | 已开通Business，C2容量及AI配额通过 |
| P9.3 | 知识加工、检索、问答、C3及清理 | 私有库及上传通过，空库检索/问答边界通过；P9.7加工修复中 | 不以测试或健康检查代替真实业务回执 |
| P9.4 | 上传持久化与存储就绪检查 | v0.11.2已部署，真实上传与重启验收待完成 | karda_objects持久卷已创建，storageConfig就绪通过；不启动被暂停的云迁移 |

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

Deployment verification also now requires both /api/health and /api/ready, each with a bounded request timeout. Liveness alone cannot pass the rollout gate.


## P8.2 正式域名配置收口

用户明确目标 karda.ruyin.work，仅保留该域名、不加旧域名跳转。回查 Arda 交付记录后，本仓新增受版本管理的非密钥生产 profile，Compose 在持久 secrets 后加载，deploy.sh 指定交付路径；不改平台变量、不复制 Arda 内部地址或凭据。同步正式示例/清单，撤销手工 nginx 安装指引。回调使用本仓真实 /auth/callback，修复 appOrigin 对回调别名的回退解析。

运维保存新域名七项配置返回500，刷新和根页面也500；尚无法证明全部保存或回滚，已发送平台 issue727。DNS 已有 Cloudflare 代理记录，新域名普通 health403，不声称接入完成。

P9：PR217/main CI 已通过，受审 db-init44941098583 成功应用0010/11/12并断言37表；v0.11.0 发布44941363441已在应用部署前取消，不移动该标签。现网仍 v0.10.3。下一个候选须包含本次域名 profile 并通过 CI/人工生产门禁。

Domain-profile validation: all858 tests passed, zero skips; TypeScript passed. Actual docker compose config verified repository and delivered layouts both override old origins while retaining dummy operator secret/DB values. Bash syntax passed; platform config save remains unverified due issue727.


### P8.2 保存确认 / P9 候选

用户完成二次验证后回读：04:16:52 CST，七项正式域名配置全部保存为karda.ruyin.work；仅web开启，机密客户端/PKCE/全域退出不变。此前500故障已恢复，不能据此关闭剩余路由问题；04:17:37新域名仍Cloudflare520，已补平台issue727。

PR218 / cba6e16及main CI44942740610通过（858项测试），v0.11.1候选run44945579438执行正常构建，生产推广仍需人工门禁。v0.11.0已取消，不移动标签。数据库增量已通过run44941098583应用；应用尚未声称部署成功。

## P9 生产部署确认

v0.11.1 / cba6e16a 已经用户审批并由 run44945579438 于04:29:59 CST发布成功。旧域名health/ready为200，DB/Redis正常；新域名仍520，旧域名仍可访问，域名迁移未验收。三条归属锚点已存在，后台对账scanned3/failed0；一条7月28日历史问答用量缺归属，拒绝猜测租户并保留重试。真实C1/C2/C3和Atlas业务验收仍待进行。P8容量与定价未完成；完整证据及限制见交付记录末节。


## P8.3a 当前实施

已将kb.max接入PrismaKbStore创建路径，网页和Agent共用。工作空间级PostgreSQL事务锁后计数、创建，缺配置/上游异常503，达到上限403，保留既有数据。已禁用部署环境演示写入。真实隔离数据库并发8请求/额度2仅2成功，回滚不占位，删除可复用，其他空间不受影响。此项尚未发布；文档/条目、存储、连接器限制仍待P8.3b/c。当前公开Free仅见seat.max，正式发布前必须核查实际C2容量授权并完成配置，不以默认额度掩盖缺项。

P8.3a本地完整回归863项通过、0失败、0跳过，包含真实隔离Redis/PostgreSQL；TypeScript及严格文档编号检查通过。正式Linux构建、审计和其他必需门禁由本批PR验证。


## P9.4 存储阻断补查

只读检查现网容器：ALIYUN_OSS_BUCKET/REGION/ACCESS_KEY_ID/ACCESS_KEY_SECRET与KARDA_OBJECT_ROOT均未配置，仅记录布尔值、未读取密钥。当前getObjectStore因此落入内存实现，之前ready只覆盖DB/Redis，不能证明可上传并保存原件。真实上传验收暂缓。

30-run-aliyun-migration明确HELD，故不启动OSS/RDS迁移。当前修正沿用文件存储：正式profile设置/var/lib/karda/objects，Compose新增命名持久卷，沿用镜像已有nextjs目录权限；不触碰生产文件、不复制Arda配置。缺持久存储配置或部分OSS配置时拒绝回退到内存。ready新增storageConfig，文件模式验证目录可读写，OSS模式只验证配置完整、不声称远端已连通。云迁移暂停保持。

P8.3a已以PR221 / f8b3788合入、全部CI通过，仍未发布。P8.3b/c继续覆盖其余数量及字节限制；P9.4新增产品配置必须走正常候选发布，不手改现网变量。

P9.4本地867项测试通过、0失败、0跳过（含真实隔离Redis/PostgreSQL），TypeScript、Compose渲染及严格文档编号检查通过；正式CI随本批PR验证。


## P8.3b 当前实施

共享Prisma写入路径执行document.max及binding.max，文档和条目合计内容数量，归档仍占位，删除释放。连接器暂停仍占位、恢复不新增，撤销后DB谓词阻止迟到恢复复活。连接器版本更新在同事务验证旧记录来源、删除旧版本并创建新版本，达到数量上限也允许净零替换，失败完整回滚。网页/Agent/同步错误码保持403/503，不变成bad_content或误报成功。

真实PostgreSQL十个混合写入/三名额恰好三成功、七个连接器/两名额恰好两成功，用量与成功插入一致；验证隔离、归档/删除、撤销恢复竞争、满额替换及失败回滚。全量869项通过、0失败0跳过，TypeScript通过。存储仍在写记录前put，字节预留与未引用对象恢复继续由P8.3c完成，本轮不发布。P9.4已以PR222/db2c9c8合入、CI通过，现网仍v0.11.1。

P8.3b退出记录：PR223以b57426a合入，CI44951664609的build/test-coverage/audit/quality-gate及密钥扫描44951664551全部通过。现网仍v0.11.1，未切候选标签。下一批P8.3c实施字节预留、共享对象引用及故障回收；新域名最近复查仍520，issue727仍开。


## P8.3c 当前实施

新增stored_object持久账本，写原件前按实际字节+历史保留引用占storage.bytes，pending/ready/deleting均计入。网页、Agent、直传连接器统一包装ObjectStore，内容相同复用，未确定写入不抢占重写；新代次独立物理键。元数据和清理共用空间存储锁，拒绝挂载跨空间、未知或已清理的对象。后台仅处理待恢复记录，引用仍存在（含软删除）的原件保留；无引用且过宽限期的对象确认删除后才释放，删除失败保留重试。历史大小未知不假设0，暂缓无法确认归属/大小的存储扩张。

DDL0013、baseline、Prisma和列权限同步，38表检查通过；未启动云迁移、未改生产结构。全量870项通过0跳过，含真实隔离Redis/PostgreSQL、并发字节额度、共享引用、响应丢失、未知写入驻留、删除失败恢复及列锁。生产仍v0.11.1。引用数据物理清除仍遵守待定保留策略，不擅自抹除历史原件；P8.4按保留容量成本测算。


## P8.4 整包提案及P8.3c合入

P8.3c以PR225/f4d239d合入，CI44979585820及密钥扫描44979585821全部通过，38表与权限守卫通过，未应用生产DDL。P8.4详见20-specs/50-commercial-package-proposal：个人129/399、团队1499及私有化联系销售，席位→存储→AI→内容容量顺序；Free仍邀请提案，不改旧订阅。满额整包预算贡献约65%–68%，AI成本翻倍压力约54%–58%；不是实际净利润承诺，现行费率与真实资源账单尚待核实。未经用户确认不发布价格或额度。


## P8.3d / P9.5 scoped configuration verification

PR226/a3345e0 and main CI passed; commercial proposals remain unpublished.
Readonly scoped checks: two C2 HTTP200 envelopes are bundled=true/tier=null,
limits contain only seat.max, storage.bytes is a quota pool. One historical
anchor exchange returns400. Platform issue728 requests managed max-cap grant
and authoritative historical-anchor reconciliation guidance. Issue727 remains.

Owner-approved db-init44980689156 applied0013 and verified38 tables. Earlier
44980617256 was cancelled before execution after a malformed pin was noticed.
Application remains v0.11.1. P8.3d adds0014/storage_watermark,39-table/grant
alignment, fresh shared headroom, durable absolute snapshots and restart retry.
Full873 tests pass, zero skips; TypeScript passes. Production0014 is pending.
P9.5 production profile now stages STATUS_PAGE=authed/STATUS_SHOW_INFRA=off;
it is not active until normal deployment. No platform source/variable changes.


P8.3d退出记录：PR227/acc8de65f0a8c38ae26ba250289e0b03478718da已合入，CI44981846064和密钥扫描44981846041全部通过，873项0跳过。补充后的历史水位初始化和重启恢复用例也通过。交付状态为源码/CI完成，DDL0014及应用未发布；不得标记P9真实验收完成。P8.4提案PR226已合入，仍需商业确认。平台issue727/728保持跟踪。


## P8.3d DDL applied / P8.5 managed metric definitions

Owner-approved run44982274412 succeeded at pinned90b715b8c7008b956e87a8ae447cf2b53445b0e1.
Increment0014 and column grants applied;39 declared tables verified. No app tag
or plan publication. Production application remainsv0.11.1/cba6e16a.

P8.5: Opera product configuration registered kb.max (libraries), document.max
(items: documents+entries) and binding.max (connections). Readback around12:01 CST
shows all three max/non-resetting. No tenant grant quantities were assigned.
Post-registration scoped C2 still returns only seat.max for the two valid
bundled scopes; historical exchange400 persists. Definition is not a grant.
Issue728 updated with this distinction and the resolved registration path.
Target-domain health recheck still520, issue727 open. Guarded release remains
held until actual capacities are configured and origin acceptance can proceed.


## P8.4 draft authorization received

User approved draft preparation only on2026-11-22. Prices/quantities now approved
FOR DRAFTS; commercial publication is not approved. Exact values and conversions
prepared in deploy/config/commercial-package-draft.json; operational readback
checklist in50-deployment/40-commercial-draft-preparation.md. Platform save is
still pending browser-control recovery (service_info timeout), not falsely complete.
No current subscription, price publication, grant or existing Free status changed.
Existing hard-call pools versus no-new-call-cap intent need a supported platform
configuration contract before publication (issue728). No artificial quota invented.

## P8.4 draft save completed after restart

Browser recovered. Saved/read back Free v2 and Starter/Pro/Business/Enterprise v1
in Admin product plans. Monthly prices0/129/399/1499/unpriced; Free and paid
self-service drafts have the six approved quantities. Enterprise description
records private deployment/contact sales, without fabricated contract quantities.
All five remain drafts; existing invitation Free v1 stays current. No publication,
grant/subscription migration, addon SKU or application release occurred.
Free v2 inherited annual0 and clearing it did not persist; contact-sales purchase
action and customer metric display order still require platform/UI acceptance.
Precise evidence and outstanding semantics:50-deployment/40-commercial-draft-preparation.md.
PR231/a19cdec merged after five required gates; this follow-up records actual saves.
P8.4 draft preparation complete; commercial publication and P9 acceptance remain held.


## P8.9 四档商业发布完成 / P9.6 应用候选

2026-11-22用户明确先发布套餐、再修正Karda。Arda三档v3已发布，Enterprise保留公开未定价v2；
Karda Starter/Pro/Business/Enterprise v1全部已发布、公开，Free已退役（保留未发布v2草稿）。
官网实际回读两产品均4档，年价1990/4990/14990；Karda为1/3/10GiB、300/1200/4000AI、
200/1000/5000知识库、20/100/500连接，席位1/1/5，内容数量不再展示。Enterprise实际为联系销售。
没有迁移旧订阅，没有购买测试单，没有发布扩展包、创建优惠活动或更改平台源代码/变量。
可消耗份额α留空，平台默认0.5；源码核查升级折抵与退款的同一默认值，非扣点或套餐定价倍率。

发布证据截图本地output/acceptance-20261122/four-public-plans.jpg；平台issue717仍处理Arda官网旧指标名、
排序和能力限制，Karda官网仍显示binding.max/kb.max而非客户名称，需按配置修正。
issue728原先的未发布说明已被本节后续事实取代；业务硬池问题继续单独跟踪，不回撤套餐发布。

PR238已以1a59f0e合入，主干CI44996423309成功。本轮18项针对回归、TypeScript与全部PR门禁通过。
v0.11.2固定1a59f0e，生产候选run44997013773构建中；包含P8.3容量执行、持久原件存储、
共享存储水位与新套餐可选内容数量上限。数据库0013/0014已获人工批准应用，本次不重复运行DDL。
Karda没有可用beta部署workflow，不创建无效beta标签；生产应用仍为v0.11.1，待所需人工生产审核。


### P9.6 report/reserve纠正与入口实测

继续追到平台权威代码后，纠正此前“零硬池会阻止Karda业务”的过度判断：Karda flush显式intent=report，
平台仅对reserve的有成本不足执行事前拒绝。report仍落完整用量，返回200+gated；Karda接受并标记已上报，
只失效权益缓存，不拒绝业务、不对有效gated回执重试。故零硬池不是已证实的业务阻断，不据此更改成本档或造额度。
issue728已附代码路径更正；仍须实测C3落账、AI不重复收费、历史exchange400和bundled容量授权。

15:14:40 Opera接入检查展开读到C1 15:09:55成功、C2 12:02:35成功；C3最近90天无事件。
摘要称四阶段完成/正式版，但展开仍有登录未实测和C3未通过，不将摘要作为端到端验收。
15:15:39浏览器实际访问karda.ruyin.work仍Cloudflare520（Ray a5e624e6eaa2ec0b），旧域名health/ready仍200。
独立HTTP探测新域名为403，仅记录不同入口观测，不冒充应用返回；issue727已更新正常浏览器证据。
v0.11.2镜像已构建，run44997013773停production人工审核，已请求用户审批。


## P9.6 production v0.11.2 deployed / P9.1 still blocked

2026-11-22 15:23 CST: owner approved production run44997013773; deployment
completed successfully at fixed1a59f0e23bc4c0aaa779bee874a23da4faf16711.
Deploy log confirms persistent volume karda_objects created and both readiness
checks passed. Independent legacy-host probes return200/versionv0.11.2/gitSha1a59f0e2;
ready reports db=ok, redis=ok, storageConfig=ok. This proves deployment/configuration,
not uploaded-object persistence across restart or real business acceptance.
No new DDL, subscription migration or platform server changes occurred.

P9.1 remains open: normal browser at15:22:11 shows Cloudflare520 for
https://karda.ruyin.work/ (Ray a5e62e783d8aec0b, Tokyo). Independent new-host
health/ready probes return403, recorded separately without attributing them to
the application. New callback remains configured; do not regress to the legacy
host to claim C1 acceptance. P9.2/P9.3 remain pending usable target-domain login.

Opera naming configuration saved/read back kb.max=知识库数量 and
binding.max=数据连接数量. Public pricing fresh load still exposes both raw keys,
so managed definitions are correct but website consumption remains a platform
display gap (issue717). Four public tiers, final annual prices and retired Free
remain verified. Screenshot: output/acceptance-20261122/metric-names-configured.jpg;
public readback: output/acceptance-20261122/pricing-after-metric-naming.jpg.
PR239 merged asfc7f1c3 after all required checks passed. Release tag stays on1a59f0e.


## P9.1/P9.2 configuration-path acceptance update (16:04 CST)

New normal-browser visit to https://karda.ruyin.work/ now reaches /gate instead
of Cloudflare520. Clicking Continue Login reused the Accounts customer session,
completed the registered new-domain callback and returned to the product.
Authenticated GET /api/access then successfully resolves C2. GET /api/ready on
the new domain returns ready, v0.11.2 /1a59f0e2, db/redis/storageConfig all ok.
No server variables, platform source, workflows or manual edge files changed by
this product task. The platform-side cause/timing of recovery is not established.
CLI requests still receive403 while browser requests work; this is not an app outage.

Current signed workspace suffix0210 returns status=null, tier=null, bundled=true,
seat.max=1; gates.productAccess=false, dataAccess=true, cta=subscribe. Login works;
the resulting 尚未开通 gate is not a failed callback or C2 transport failure.
Admin actual subscription list has16 rows/7active and no Karda subscriptions
(search Karda returns0). No subscription, grant, order or payment was created.
Asked owner to open the intended test workspace through normal subscription or
voucher, or identify an existing subscribed workspace. Business/C3 acceptance
requires that legitimate authorization; do not fabricate UI entitlement from bundled.

P9.1 target-domain reachability verified; old-domain retirement remains open.
P9.2 login/callback verified, global logout/isolation and message acceptance pending.
P9.3 business processing/C3 and P9.4 real upload/restart acceptance remain pending.
Proof: output/acceptance-20261122/new-domain-accounts-gate.jpg and
output/acceptance-20261122/no-karda-subscription.jpg.


## P9.7 subscribed production acceptance / processing dispatch remediation

Owner confirmed subscription. Browser C2 now returns active/business, productAccess
and dataAccess true, seat.max5/kb.max5000/binding.max500. New ai.credit4000 pool
is present; other same-workspace pools remain distinct, not silently reallocated.
Created private Integration acceptance20261122 library
117c7b9a-6c5d-4f2d-bddb-f7b77a8476f0. Uploaded355-byte synthetic-acceptance.md,
SHA2561351aa4d950d5699e4ae2c65484788e241f91a31ae6148d3bf197ae897cda97f.
File selection initially failed in the browser tool; supported concurrent chooser
wait+AX click succeeded. This was not established as a product upload defect.
Document accepted and queued. Retain isolated fixture pending acceptance; no public
sharing, external credential or deletion performed.

Scoped empty-library search returns complete/zero hits. Empty-library answer
returns no evidence/no generated answer. These do not prove Atlas generation or
embedding. First-party console search is intentionally not karda.search-metered;
Opera missing C3 after this call is not evidence of a broken usage worker.

Two actual Karda gaps: instrumentation never starts processing dispatch (only the
protected internal tick could drain); task detail returns DEMO_TASK_DETAIL for
arbitrary ids. Observed task list links to bd5f01ff, then detail falsely shows a
14.2MB legal PDF while uploaded fixture is355B. No false processing acceptance.

Remediation candidate: automatic bounded processing passes using existing DB
configuration; advisory session lock shared with protected HTTP tick; 200-document
keyset recovery per pass; at most20 tasks per pass;5s work cadence/5min parked
resume. Recovered retries retain ledger attempts/backoff; already indexed/deleted
work is skipped. No new variables, schema or manual server changes. Task links
retain full UUID; production detail scopes query by workspace and returns real
ledger/doc/stages only,404 for missing/malformed ids. Remove authored progress,
repair claims, cost estimates and unwired action buttons from live detail.

50 targeted tests and TypeScript/data-architecture checks pass. PostgreSQL lease
exclusion/failure-release test added to existing isolated CI DB suite. Full CI,
release and real upload/index/answer/C3/restart acceptance remain pending.
Proofs: private-library-created.jpg, empty-library-search.jpg,
empty-library-answer-guard.jpg, task-detail-demo-mismatch.jpg under
output/acceptance-20261122. No platform source or server variable changes.

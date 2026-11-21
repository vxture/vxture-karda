# Karda 整改第一批：现状与平台接口差距

日期：2026-11-22。状态：首轮代码盘点及退出链路修正；尚未发布。

P0 已随 PR207 / ecc382d 合入，未发布。后续批次统一以 [20-rectification-batches-20261122](20-rectification-batches-20261122.md) 跟踪；下文原批次顺序为起始盘点时的分组，P0 时点的未修正项不代表后续实现状态。

## 边界与基准

本次在 Karda 本仓实施，平台只读核查，缺口通过详细 issue 沟通。不得因仓内历史说明要求而修改平台源码、创建平台工作树、写平台服务器变量或手工安装边缘路由。L2/L3 接入走平台配置；Karda 自身参数走正常部署。

本地起点为 origin/main 2503652（v0.10.3 发布台账），开工时受跟踪文件干净。真实生产 https://karda.vxture.com/api/health 返回 version=v0.10.3、gitSha=2f7b142a、stage=production；/api/ready 返回 200/ready，DB、Redis 均 ok。对应生产部署 run33327793850 成功。主干台账提交与部署提交不同属于文档后续合入，不是版本异常。

上述只证明服务存活和两个基础依赖就绪，不证明登录、套餐、AI 授权或完整知识链路通过。本轮未登录管理平台、未读取用户数据、未进行付费推理或生产业务写入。

参考：本仓产品蓝图 20-specs/30-agent-knowledge-blueprint.md、KD-017、现行产品定义 v0.5；平台 GitHub main 的 identity/080-rp-integration.md 已只读获取，明确 refresh 错误不单独证明中央退出，session/status 不提供上下文切换通知、不新增高频后台轮询。平台接口落地前还需核查各专项最新规范与实际返回。

## 现状矩阵

下表“发现”指静态代码事实，不能据此推断所有线上请求都已失败。

| 领域 | 文件依据（portals/app/app 下） | 当前事实 / 差距 | 处理 |
| --- | --- | --- | --- |
| 入口 | access/product-gate.tsx、api/access/route.ts | 入口单次合并读取会话和权限，未复制 Arda 的 focus 阻断循环；仍为旧视觉、旧订阅文案，无角色未分配独立入口 | 独立设计与状态模型批次 |
| 订阅地址 | entitlement/deeplink.ts | 仍拼 console /subscribe、intent、target_tier；与冻结通用规范的主站产品订阅页不一致 | 接入新配置及 CTA 权限批次，不能只换 URL 就认定全流程完成 |
| 会话读取 | auth/lib/session.ts、api/access/route.ts | refresh 并发无共享锁；刷新失败返回 null，入口还吞掉会话异常变 anonymous | Accounts 批次，区分故障/退出，保留范围校验 |
| 会话保存 | auth/lib/session-store.ts | putSession 无条件 SET EX，可在刷新与退出并发时重建已撤销会话，并延长 TTL | Accounts 批次，受锁/条件更新与绝对过期回归 |
| 主动退出 | auth/logout/route.ts | 未带 client_id；本地删除失败被忽略 | 本批补 client_id；本地删除失败策略和完整退出验收仍待后续 |
| 后端退出 | auth/backchannel-logout/route.ts | 事件对象、jti/整数寿命校验不足；先占 replay 标记再删会话，删除错误吞掉 | 本批严格校验、删除可重试、失败 503；不宣称解决刷新复活竞态 |
| C2 | entitlement/platform-client.ts、resolver.ts | x-vxture-internal-auth；缺配置回落 Mock；封装用请求范围覆盖返回范围，未验证平台响应归属；请求无有界超时 | 票据与生产 fail-closed 批次 |
| 额度池 | entitlement/quota.ts | 同 metric 只取第一个池，可能忽略购买/共享池 | 对照平台过滤与单位后修正并测试，不能复制 Arda 指标 |
| C3 | usage/lib/flush.ts、api/usage/flush/route.ts | 旧共享密钥；仅凭 HTTP 200/409 标记终态，未验证 receipt；源码调用点只有手动入口 | 自动排空和凭据整改；外部 cron 是否存在尚未核实 |
| 生命周期 | provisioning/webhook/route.ts、lib/handler.ts、lib/prisma-store.ts | header 可替代签名 JSON id；所有事件默认 seq=0；订阅/授权通知共用生命周期水位；多个独立存储调用不具备事务串行保证 | 事务、严格载荷、版本分离、ACK 与读对账批次 |
| Atlas S2S | kb/retrieval/atlas-token.ts | form client_secret_post；仅检查 access_token 字符串，无 JWT actor/aud/scope/租户/寿命验证及请求边界 | 核对现行票据规范后统一适配，不先认定 post 认证本身非法 |
| AI 实际功能 | kb/atlas/*、kb/processing/atlas-embedder.ts、kb/retrieval/* | embedding/rerank/extract/chat 适配及加工/检索/问答代码已存在，endpointCode 产品轴已使用 | 保留既有能力；实际配置、授权、推理、计量未验收 |
| Atlas 新契约 | kb/atlas/contract.snapshot.json、codes.ts；本仓 issue206 | 当前快照 43 码/c1-d2ecccf5b20d；对端 10 月通知已到 53 码/c1-3d7157ece0a6，并新增不可重试 UPSTREAM_ACCOUNT_REFUSED | 拉取现行权威契约并检查挂起/失败策略；已有 issue206，不重复发问 |
| 知识加工 | kb/processing/orchestrator.ts、stages.ts、ir.ts、chunk.ts | 有获取/解析/切分/向量/提交管线与重试语义；部分注释仍称 embed stub | 追真实 wiring，核对幂等、版本与恢复，不重建现有功能 |
| 健康/就绪 | api/health、api/ready、lib/probes.ts | 生产身份与 DB/Redis 通过 | 保留；单独核对其他依赖的适用性 |
| 消息同步 | auth/provisioning 消费者及浏览器组件 | 未找到通用浏览器权限消息通道；当前无理由引入持续权限轮询 | 参考 Arda ADR-014，但它只是架构，非已交付 SDK |
| 文档 | CLAUDE.md、90-memory/10-agent.md、70-workplan/00-index.md | bootstrap/未部署旧描述与生产事实不一致 | 本批纠正当前入口说明，历史流水保留 |
| 依赖安全 | pnpm-lock.yaml；本批首轮 CI audit | 8 个包受 38 项已知漏洞影响，含 Next.js，阻断合并 | 本批提升 Next.js 至 15.5.29，并定向升级其他修复版本；不新增审计忽略 |

## 批次顺序

1. **本批**：现状矩阵、明确边界、退出最小可靠性修正和针对性回归，通过本仓 PR 留档。没有发布标签，不改变线上行为。
2. **Accounts 与票据**：刷新互斥与防复活、错误语义、会话检查契约、租户范围及 S2S 校验，替换 C2/C3 旧共享凭据；完整保持终端和环境隔离。
3. **配置生命周期与计量**：严格签名载荷、版本分离、事务并发、ACK/读对账、持久用量 receipt 和自动 worker；测试真实 DB/Redis，beta 不改生产事实。
4. **设计**：基于 CoSpace v1.3.1，独立 Karda 标识、背景和入口状态，用户确认后冻结。不改变原 Ruyin/版权，不覆盖已有 ShellViewport 与导航决策。
5. **商业与成本**：盘点旧决策 KD-207 和平台已发布事实，再计算存储、向量、AI 和计算整包成本；不继承 Arda 额度价格。域名、终端、价格、正式套餐发布另行确认。
6. **验收与发布**：授权小样本走导入→解析→索引→检索→上下文/问答，核对 AI 原始用量归属和 credits；候选 beta 后按人工批准晋级 prod，清理临时资源并归档。

平台问题应先核对现有 issue 是否覆盖，缺口附契约出处、脱敏复现、预期/实际及验收条件；本轮已发现的多项问题在 Karda 消费端，不能转嫁为平台缺陷。旧文档列出的 Atlas/Runos/套餐阻塞是否仍有效需重新验证，暂不重复发 issue。

## 本批修正的验收界限

后端退出仅接受经既有 RS256/issuer/audience/expiry 验证后、无 nonce、有非空 sid/jti、有合法事件对象及整数 iat/exp 的载荷。删除失败返回 503；同一有效通知可幂等重试，不提前标记已处理。单会话先删除权限凭据，再移除索引，避免“删除失败却索引已丢”的重试盲区。

本批未解决并发 refresh 重建会话、中央状态兜底或浏览器推送，未验证真实 Accounts/运维退出隔离。测试使用本地签名和可注入存储；实际 Redis 并发回归安排在 Accounts 批次。生产仍为 v0.10.3。

本地验证：805 项测试全部通过，无跳过；TypeScript 检查通过。文档编号、接口登记、Atlas 现有快照一致性和技术债护栏通过。快照机检通过只证明消费代码与仓内旧快照一致，不能证明已跟上对端最新契约。构建和全部必需门禁以本批 PR CI 为准。

首轮 CI 构建和测试通过，但 audit 阻断后追加定向依赖修复：Next.js 15.5.29、@hono/node-server 2.1.6、effect 3.22.1、fast-uri 3.1.9、hono 4.13.16、mysql2 3.23.1、sharp 0.35.5、source-map-js 1.2.2。锁文件带入必要的传递依赖与平台二进制更新；没有升级产品 DS 或移除门禁。最终验证以修复后的 CI 为准，未上线旧依赖也未因主干修复自动替换。

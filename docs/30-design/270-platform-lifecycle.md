# 平台生命周期消费与本地引用

权威：平台 product_200、product_210、provisioning:read 及开通 ACK 契约。本文件只定义 Karda 消费端的存储与失败处理，不扩展平台 wire 标准。

## 入口与载荷

标准入口为 POST /api/webhooks/vxture；保留 /provisioning/webhook 历史别名。先按原文验证 HMAC 和轮换签名，再校验 JSON 结构、UUID 引用、产品 karda、事件类型、时间及版本。存在的 delivery/event header 必须等于已签名 body；限制 1 MiB。tenant.provisioned / tenant.deprovisioned 要求正整数 seq；subscription_changed / grant.invalidated 无 seq，不参与生命周期水位。

每个工作空间与每个 delivery 分别使用事务级 advisory lock；状态、生命周期水位和投递 receipt 同一事务提交。版本陈旧也记录 receipt；未知事件记录 ignored，不改水位。receipt.payload_hash 为已签名语义载荷的稳定 SHA256，包含新增字段；相同 ID 不同载荷拒绝。历史 NULL hash 不假装匹配，必要时由只读对账恢复当前事实。初始化钩子必须可重入，不能在事务中执行远程副作用。

## 本地引用与 DDL

- app_instance 继续保存本地开通状态及现有引用；不开放 tenant_id 的 UPDATE 权限。
- 新 provision_anchor 仅记录 workspace_id/product_code/tenant_id 的不可改写引用，没有商业额度或用户身份镜像。它使历史 tenant_id=NULL 的实例能根据已签名事件或验证过的读取结果恢复服务调用范围。现有非空 tenant_id 或 anchor 与新租户不一致时拒绝，不能迁移归属。
- webhook_delivery.payload_hash 仅 INSERT，receipt 仍不允许 UPDATE；provision_anchor 不允许 UPDATE/DELETE。
- baseline 与 Prisma 同步；现网结构由 0010_provisioning_receipts.sql 经 db-init 应用，应用启动绝不执行 DDL。运行候选前必须先完成受控 db-init。

## 回执与对账

成功提交后才 ACK；重复投递可以再次 ACK，以修复提交后进程中断。发送前用同一工作空间锁读取状态与水位，仅当前 provisioned 且版本相等可发送 ready；响应必须匹配工作空间、产品、replayed 与 acked_at。HTTP 或响应校验失败返回 503，平台重试原投递；定期对账也会重试当前状态的 ACK。

平台 ACK 尚不原子校验生命周期版本；detail.seq 只是证据，本地检查无法消除 HTTP 在途竞态。剩余缺口跟踪 [平台 issue720](https://github.com/vxture-platform/vxture-platform/issues/720)，不能宣称已端到端消除。

对账使用独立 provisioning:read 票据：无用户、组织/工作空间或写 scope，校验 RS256、actor=karda、aud=vxture、mode=service 及有效期。启动后一次、每 5 分钟后台全量分页读取，拒绝重复 cursor 和超大页面；一行失败不掩盖其他行。缺行不代表删除，pending 不当成已就绪，同版本可补历史 anchor，旧版本不能覆盖新状态。

目前读取与通知没有可信环境字段。仅 production 自动应用读取并 ACK；beta 对账只读，拒绝应用无环境范围的生命周期 webhook，避免把生产状态镜像到 beta。这里没有新增浏览器权限轮询。多实例商业缓存失效与浏览器事件仍归 P7。

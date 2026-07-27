# karda → 平台线：首次上线完成 + C1/C2 联调探针结果

> **发件**：vxture-karda（产品线）
> **收件**：平台线（vxture-platform）
> **时间**：2026-07-23 17:22（stamp 2607231722）
> **主题**：karda 生产栈已上线 worker-02；回报贵函 `40-2607230130` §3 建议的两项自测结果
> **状态**：open —— C2 已闭环；C1 差最后一跳（edge vhost，B 段）
> **前序**：`40-2607230909`（B 段请求）、`50-2607230957`（A 段核对与三问）

---

## 1. 上线确认

`v0.1.1` 已部署至 worker-02，生产栈运行中。

| 项 | 实测 |
|---|---|
| 容器 | `karda-app`（healthy）/ `karda-db` / `karda-redis` |
| 镜像 | `ghcr.io/vxture/karda-app:sha-2af1e38`（不可变 tag，GHCR 主源命中） |
| VERSION 溯源 | `2af1e38` == 部署 SHA |
| `/api/health` | 200，025 身份块完整：`version=v0.1.1` `gitSha=2af1e382` `stage=production` `buildTime=2026-07-23T07:19:48Z` |
| 端口 | `0.0.0.0:3233` 监听，宿主机探测 4.6ms |

## 2. C2 探针结果（贵函 §3 建议项）—— **已闭环**

在 worker-02 上按应用真实调用形态（`GET {base}/platform/entitlements?workspace_id=&product=karda`
+ `x-vxture-internal-auth` 头）探三个方向：

| 方向 | HTTP | 响应 |
|---|---|---|
| 无鉴权头 | **401** | `{"message":"invalid_internal_auth",...}` |
| **正确 token** | **200** | `{"workspace_id":"...","product":"karda","status":null,"tier":null,"bundled":false,"limits":{},"quota_pools":[]}` |
| 故意错的 token | **401** | `{"message":"invalid_internal_auth",...}` |

200 那条正是贵函预告的**未订阅分支**（五档骨架仍 DRAFT），符合预期。

第三个方向是本仓加测的：只验"正确 token 能过"不足以证明鉴权生效——万一端点根本没启用校验，
错 token 也会返回 200，那时"通了"是假象。三个方向齐了才能断言链路正确。

karda 侧 `/api/status` 自报：`c2.resolver = "platform"`（非 Mock）、`platformApiConfigured=true`、
`authTokenConfigured=true`。

**`PLATFORM_API_URL` 用 `http://100.100.197.42:8080`**（vx-worker-01 的 tailnet IP）。注意本仓
S2S 出网守卫只放行 loopback / RFC1918 / `100.64.0.0/10` / `.ts.net` / `.tailnet` / `.internal`，
**裸 MagicDNS 短名走 http 会被拒**——若贵线后续变更内网基址，请给 IP 形态或 https。

## 3. C1 状态 —— **差最后一跳**

| 检查 | 结果 |
|---|---|
| OIDC discovery（自 `karda-app` 容器内） | 可达，`authorization_endpoint` / `token_endpoint` / `jwks_uri` 均正常返回 |
| `/auth/login` | **307** → `https://accounts.vxture.com/oidc/authorize?response_type=code&client_id=karda...` |
| `/api/entitlement`（无会话） | `401 {"authenticated":false}`，正确拒绝 |
| `clientSecretConfigured` | `true` |

即 RP 侧配置正确、授权 URL 构造正常。**完整登录闭环还差 `https://karda.vxture.com` 可达**——
回调 URI 走公网，需要 B 段的 edge vhost（`40-2607230909` §3.1，未回）。vhost 装好后本仓立即
走一遍真实 authorize→token 交换并回报。

## 4. 贵函 §2 的密钥交付问题：已在本仓侧解决，但结论不变

`50-2607230957` §2.1 报告的"`OIDC_CLIENT_SECRET` 以 repo secret 形态交付、在本仓不生效"，
现已由 owner 将 plaintext 直接写入主机 `.env` 解决——`/api/status` 显示 `clientSecretConfigured=true`。

**但那份 repo 级 secret 仍然是死的**：部署链无任何一步引用它，且 GitHub secret 只写不可读。
`50-2607230957` §5 的 R2 建议不变——**建议删除**，免得后来者误以为凭据已就绪。等贵线确认后本仓可代删。

R3（`PLATFORM_INTERNAL_AUTH_TOKEN` / `PLATFORM_API_URL` 的实值）已由 owner 带外提供并生效，
本项可关闭。

## 5. C3 与数据面：现状

- **C3**：`webhookSecretConfigured=false`。签名密钥属 B 段未发放，当前 C3 拒收所有入站 webhook
  ——**这是正确行为**，非故障。`internalJobTokenConfigured=true`（本仓自生成，门控
  `POST /api/usage/flush`）。
- **业务库**：`data.database.reachable=false`。属本仓自有事项，走 `db-init.yml`
  （`confirm=yes` + `expected_sha` 钉版本 + 审批门）建结构，与平台线无关，已在办。
- **Redis**：`reachable=true`。

## 6. 尚待平台线的三项（均在 B 段函内，此处只做汇总）

1. **edge vhost** `karda.vxture.com` → `vx-worker-02:3233`（**卡住 C1 闭环，优先级最高**）
2. `product_webhooks` 登记投递地址 + `KARDA_PROVISION_WEBHOOK_SECRET` 实值（解封 C3）
3. 五档真实权益发布——待本仓 `10-product-definition.md` 定稿后由 karda 提交 tier→权益映射，
   非贵线当前待办，此处仅记依赖

第 1 项落地后 C1/C2 即可宣告全通，届时本仓回函报告端到端登录结果。

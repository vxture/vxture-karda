# karda → 平台线：产品注册请求（A 段，无前置项）

> **发件**：vxture-karda（产品线）
> **收件**：平台线（owner / 平台控制面）
> **时间**：2026-07-22 23:38（stamp 2607222338）
> **主题**：karda 产品目录登记、订阅档位 seeding、C1 OIDC 客户端注册、C2 凭据发放
> **状态**：open
> **依据**：`docs/50-deployment/10-platform-registration-checklist.md`；`product_240_repo-template.md` §2.8
> **配套**：B 段（webhook tailnet 地址 + edge vhost）**待部署主机分配后另函**，见 §5

---

## 1. 为什么拆 A/B 两段

注册清单里的项分两类：**只依赖产品码**的（本函 A 段，产品码 `karda` 实例化时已固定，可立即办理）
与**依赖部署主机/端口**的（B 段）。karda 尚未获分配部署主机，B 段的 `KARDA_WEBHOOK_BASE_URL`
（tailnet 投递地址）与 edge vhost 转发目标都填不出实值，硬填会变成猜测。故先发 A 段，不让
无前置的事项陪着一起等。

## 2. 仓库侧现状（供平台线核对，无需动作）

| 项 | 状态 |
|---|---|
| 仓库 | `vxture/vxture-karda`，PUBLIC，`main` 为默认分支 |
| 分支保护 | ruleset `19556856` active，五个 required context 齐（`quality-gate`/`build`/`test-coverage`/`audit`/`gitleaks`） |
| CI | `main` 全绿；首跑发现的 `sharp` 高危已按治理规范 §9 以 `pnpm.overrides` 修复（PR #6） |
| org 级共享凭据 | `NODE_AUTH_TOKEN` / `ALIYUN_ACR_USERNAME`·`PASSWORD` / `TAILSCALE_OAUTH_*` 均已共享到本仓 |
| repo 变量 | `ALIYUN_ACR_NAMESPACE` = `vx-foundation` |
| 集成层代码 | C1/C2/C3 三通道自模板继承，**至今只在 Mock 下验证过**，未接触真端点 |

最后一行是本函的紧要性所在：三通道代码的正确性在真凭据到位前始终是未验证前提，而 karda 的
检索侧（可见集缓存）与 Arda 通道（S2S 身份）都建在其上。

## 3. 请求事项（A 段）

### 3.1 产品目录与计划

- [ ] 产品目录新增 karda 行：`code=karda` / `layer=L2` / `type` 按平台分类填。
      产品矩阵 `product_100_matrix.md` 第 43 行已有 karda 条目（L2 知识平台，`karda.vxture.com`），
      本项是把矩阵条目落为控制面目录记录。
- [ ] Seeding karda 的订阅档位结构（五档 `free`/`starter`/`pro`/`business`/`enterprise`，
      取值权威 = `@vxture/shared` 的 `TIERS`，本仓直接 import，未另定义）。
      各档权益内容属 karda 产品决策，尚在 `docs/20-specs/10-product-definition.md` 定稿中，
      **本项只需档位骨架存在**，权益映射后续由 karda 提供。

### 3.2 C1 OIDC（customer realm）

- [ ] 注册**生产客户端** `karda`，realm = customer：
      - `redirect_uri` = `https://karda.vxture.com/auth/callback`
      - `post_logout_redirect_uri` = `https://karda.vxture.com/`
      - `back_channel_logout_uri` = `https://karda.vxture.com/auth/backchannel-logout`
      - 允许 scope = `openid profile email phone`（已退休的产品码 scope 与商业 scope 不注册）
- [ ] 发放该客户端的 `OIDC_CLIENT_SECRET`（owner 手工转运至本仓 GitHub secret）。

**beta 客户端 `karda-beta` 暂缓**：双客户端是正典（back-channel logout 单 URI 硬约束），但 beta 的
三个 URI 依赖尚未分配的 beta 主机。karda 仓已就此登记 **TD-001**（继承的 `deploy.yml` 为 prod-only，
偏离治理规范 §4 的两档默认），回收条件即 beta 主机分配。beta 主机定后随 B 段一并请求。

### 3.3 C2 权益通道

- [ ] `PLATFORM_API_URL`：内网基址（本仓 `.env.example` 中该键留空即回落 Mock resolver，
      填入才切真解析器）。
- [ ] `PLATFORM_INTERNAL_AUTH_TOKEN`：S2S 内部鉴权密钥。

### 3.4 C3 密钥（地址登记归 B 段）

- [ ] `KARDA_PROVISION_WEBHOOK_SECRET`：webhook 签名密钥，加入平台 env 并转运本仓。
      密钥的发放不依赖投递地址，故列入 A 段；**`product_webhooks` 的地址登记入 B 段**。
- [ ] `INTERNAL_JOB_TOKEN`：门控本仓 `POST /api/usage/flush` 的内部任务令牌。

### 3.5 密钥转运纪律

所有 secret 值由 owner 手工转运（不入库、不走不安全信道）。org 级共享凭据（ACR / tailscale / npm）
已在 org 配置并共享给本仓，**不必逐仓重建**（治理规范 §3 层级）。本函请求的均为 karda 专属凭据，
落 repo 级或 environment 级。

---

## 4. 顺带报告两项 org 级卫生问题（非本函请求，供平台线自行处置）

### 4.1 `PROMOTION_TOKEN` 疑似死值

治理规范 §1 明写"**弃用整套 gitflow**：`develop`/`beta`/`main` 三分支晋升、`branch-promotion.yml`、
`deploy-production.yml`、`PROMOTION_TOKEN`/`PROMOTION_ACTOR`、Fast-forward Promotion"。但
`PROMOTION_TOKEN` 仍在 org secrets 中并共享给本仓（本仓无任何引用）。§3 要求"定期审计死值/重复，
0 引用的旧凭证及时删，减攻击面"。

同批可疑（未逐仓核实引用面，仅报现象）：`SONAR_TOKEN`、`TAILSCALE_AUTHKEY`（与
`TAILSCALE_OAUTH_CLIENT_ID`/`SECRET` 并存，疑为 OAuth 迁移前的遗留）。org 变量
`TAILSCALE_OAUTH_CLIENT_TAG` = `tag:promotion` 是遗留命名但仍在功能路径上，不属死值。

### 4.2 SonarCloud 项目绑定与仓库名不符

本仓 PR 检查中出现 `SonarCloud Code Analysis`，项目 key = **`vxture_Knowledge-Vault`**——
这是仓库初始 README 标题（`# Knowledge-Vault`）留下的旧绑定。当前能通过、且不在五个 required
context 内，**不阻塞**；但项目名与仓库已对不上，报表归属会误导。是否重绑到 `vxture_vxture-karda`
由平台/工具线定。

---

## 5. B 段预告（阻塞项）

以下事项待 **karda 部署主机与端口分配**后另函请求，一并列出以便平台线预估：

- `product_webhooks` 登记 karda 的 tailnet 投递地址（`KARDA_WEBHOOK_BASE_URL`）
- edge vhost `karda.vxture.com` → 分配主机:端口
- `karda-beta` OIDC 客户端及其三个 URI（连带关闭 TD-001）

主机分配是 owner/基建决定，不是平台线动作；karda 侧已具备接收条件（stack_root 约定
`/srv/md0/karda`，部署工作流自模板继承并已就位）。

---

## 6. 回复方式

平台线可在本仓 `docs/80-liaison/` 或平台仓 `80-liaison/` 回函（本仓按 `NN-{YYMMDDHHMM}-{slug}.md`
命名，入函正本留发信仓、本仓只记收悉与跟进）。密钥值不走文档，由 owner 手工转运至
`vxture/vxture-karda` 的 GitHub secrets。

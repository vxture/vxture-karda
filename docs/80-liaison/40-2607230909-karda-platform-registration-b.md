# karda → 平台线：产品注册请求（B 段，生产目标已定）

> **发件**：vxture-karda（产品线）
> **收件**：平台线（owner / 平台控制面 / 边缘）
> **时间**：2026-07-23 09:09（stamp 2607230909）
> **主题**：edge vhost `karda.vxture.com` → `vx-worker-02:3233` 安装；
> `product_webhooks` 投递地址登记；生产环境密钥转运清单
> **状态**：open
> **前序**：`20-2607222338-karda-platform-registration-a.md`（A 段，open）
> **依据**：owner 2026-07-23 定：karda 生产部署 worker-02；开发阶段直发生产，
> beta 为预留发布通道、另配服务器

---

## 1. 相对 A 函的变更

A 函 §5 把 B 段列为"待部署主机分配"。生产目标已定，B 段现可办理。

**A 函 §3.2 的 `karda-beta` 客户端仍然暂缓，措辞不变**——beta 是全产品标准两档模型里的第二档，
karda 并未放弃，只是其服务器尚未准备；届时随 beta 服务器一并请求。本函**不撤回**该项，也**不**
请求现在注册。

## 2. 部署参数（生产档，已定）

| 项 | 值 | 依据 |
|---|---|---|
| 部署主机 | **worker-02**（tailnet MagicDNS `vx-worker-02`，IP `100.76.219.48`） | owner 2026-07-23 |
| 主机 profile | tailnet 内、**非 VPC** → GHCR 主源 + ACR 兜底 | 治理规范 §5；与同主机的 arda 一致 |
| stack_root | `/srv/md0/karda` | 治理规范 §4 `/srv/md0/<product>` |
| `DEPLOY_DIR` | `/srv/md0/karda/deploy` | 精确到含 compose + `.env` 的那一层（治理规范 §6 varda 教训） |
| **`APP_PUBLISH_PORT`** | **3233** | worker-02 现有占用：arda prod 3230、arda beta 3231、vxtpl demo 3232 |
| 当前活跃档位 | **仅生产**（开发阶段直发生产） | beta 待其专属服务器，见 §4 |

**端口 3233 请在安装 vhost 时顺带核实一次**：上述占用是从 `vxture-arda` 仓的 `deploy/env/*.env`、
`configs/edge/*.conf` 与部署文档推出的，karda 侧无法 SSH 到主机实测。若 3233 已被本仓不可见的服务
占用，请告知改号——karda 侧改动面只有三处（repo 变量 `APP_PUBLISH_PORT`、
`configs/edge/karda.vxture.com.conf` 的 `$upstream` 单行、`.env.example`）。

## 3. 请求事项

### 3.1 Edge vhost

- [ ] 安装 `karda.vxture.com` vhost，上游 → **`vx-worker-02:3233`**。
      源文件已就绪：本仓 `configs/edge/karda.vxture.com.conf`，照 arda 现行 vhost 同款
      （共享 `*.vxture.com` 通配证书、HSTS/XFO/nosniff/Referrer-Policy 四个安全头、
      `client_max_body_size 25m`、`location = /api/usage/flush { return 404; }` 挡内部端点）。
- [ ] **上游写法确认**：文件用 MagicDNS 名 + `resolver 100.100.100.100`。arda 的 vhost 注释指出，
      现行共享 edge nginx 容器**只解析 Docker DNS**，故既有各 vhost 一律硬编 IP `100.76.219.48`。
      若该前置仍未就绪，请把 `set $upstream` 那**一行**改为 `"100.76.219.48:3233"` 后再安装——
      上游只出现在这一处。
- [ ] DNS：`karda.vxture.com` A/CNAME 指向共享 edge。
- [ ] 主机防火墙：tailscale 接口放行 3233 入站，公网接口封禁该端口（照 arda 部署文档同款处置）。

### 3.2 C3 投递地址登记

- [ ] `product_webhooks` 登记 karda 的 tailnet 投递地址
      `KARDA_WEBHOOK_BASE_URL` = `http://vx-worker-02:3233`（tailnet 内直达，不经公网 edge）。
      签名密钥 `KARDA_PROVISION_WEBHOOK_SECRET` 已在 A 函 §3.4 请求，此处只补地址。

### 3.3 尚需 owner 手工转运的密钥

本仓 `production` 环境已建（Required reviewer = owner），四个非密值已灌入：
`DEPLOY_HOST=vx-worker-02` / `DEPLOY_USER=stone` / `DEPLOY_PORT=22` /
`DEPLOY_DIR=/srv/md0/karda/deploy`。仍缺：

- [ ] `DEPLOY_SSH_KEY`——worker-02 上对 `stone` 授权的私钥（+ 可选 `DEPLOY_SSH_KEY_PASSPHRASE`）。
- [ ] `DEPLOY_KNOWN_HOSTS`——**必填、不可省**：从可信网络 `ssh-keyscan -p 22 vx-worker-02` 采集。
      复合动作 `tailnet-ssh-connect` 对空 known_hosts **fail-closed**（拒绝 TOFU 回落防 MITM），
      缺此键部署直接失败而非降级。
- [ ] `ENV_FILE_BASE64`——karda `.env` 的 base64（依本仓 `.env.example`：域名 `karda.vxture.com`、
      库 `vxturebiz_karda_prod` / 角色 `karda_svc`、`APP_PUBLISH_PORT=3233`，加 A 函请求的
      OIDC/webhook/job 密钥）。bootstrap 仅在主机无 `.env` 时写入，**已存在则不覆盖**。
- [ ] `KARDA_DB_SVC_PASSWORD`——服务角色口令（对照 arda `production` 环境的 `ARDA_DB_SVC_PASSWORD`）。
- [ ] 主机侧一次性：`mkdir -p /srv/md0/karda`，确认 worker-02 上 GHCR / ACR 登录可用。

## 4. beta 档：状态说明（非请求项）

治理规范 §4 的两档模型（`beta-*`→beta、`v*.*.*`→production）是全产品标准，karda **遵循**。
当前开发阶段全产品直发生产，beta 作为**预留发布通道**、待另配服务器后启用。故：

- 本仓 `deploy.yml` 暂不含 `beta-*` 触发器——触发器指向不存在的环境只会失败得莫名其妙；
- 不建 `beta` GitHub Environment，不请求 `karda-beta` OIDC 客户端；
- 登记为 TD-001（**未完成项**，非"已接受偏离"），回收条件 = beta 服务器就位。

**已接受的过渡期风险**：无预生产档意味着 `v*.*.*` 是代码首次上真机，故 `production` 环境的必审人门
承担全部上线前把关，回滚（`rollback.yml` 拉不可变 `sha-` tag）是唯一恢复路径。

beta 服务器就位时需要一并办的：`beta` Environment（无审批门）及其 `DEPLOY_*`、`beta-*` 触发器与
路由分支、`stack_root`/`deploy_dir` 改为按环境分支（现硬编生产路径）、`karda-beta` OIDC 客户端。
`vxture-arda` 的 `deploy.yml` 是现成的两档参照实现。

## 5. 顺带：两处与 arda 现状的不一致（供核对，非请求）

1. **ACR 兜底端点不一致**。arda `deploy/env/*.env` 用
   `FALLBACK_IMAGE_REGISTRY=crpi-l3l7g186zpo2if7p.cn-hangzhou...` / namespace `agentos`；
   org 变量是 `ALIYUN_ACR_REGISTRY=crpi-xhjfv6mu59629oau.cn-beijing...`，karda repo 变量
   `ALIYUN_ACR_NAMESPACE=vx-foundation`（owner 2026-07-22 指定）。两套 ACR 实例 + 两个 namespace。
   karda 按 org 变量走；**若 arda 那份才是 worker-02 实际可达的兜底，请指出**——非 VPC 主机以 GHCR
   为主源，兜底只在 GHCR 不可用时启用，故此不一致平时不显形，出事时才暴露。
2. **`DEPLOY_DIR` 键名**。arda `production` 环境用 `DEPLOY_REPO_DIR`，治理规范 §6 已明定权威键名是
   `DEPLOY_DIR` 并标注 arda 是历史偏差。karda 用标准键名，两仓不同属预期，在此说明以免核对时误判。

## 6. 回复方式

同 A 函：可在本仓或平台仓 `80-liaison/` 回函；密钥值不走文档，由 owner 手工转运至
`vxture/vxture-karda` 的 `production` 环境 secrets。

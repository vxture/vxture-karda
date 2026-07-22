# karda → 平台线：产品注册请求（B 段，主机已定）+ 撤回 beta 客户端请求

> **发件**：vxture-karda（产品线）
> **收件**：平台线（owner / 平台控制面 / 边缘）
> **时间**：2026-07-23 00:36（stamp 2607230036）
> **主题**：edge vhost `karda.vxture.com` 安装、`product_webhooks` 投递地址登记；
> **撤回** A 函 §3.2 预告的 `karda-beta` 客户端请求
> **状态**：open
> **前序**：`20-2607222338-karda-platform-registration-a.md`（A 段，open）
> **依据**：owner 2026-07-23 定：karda **部署在 worker-02、生产单档**

---

## 1. 相对 A 函的变更

A 函 §5 把 B 段列为"待部署主机分配"。主机已定，B 段现可办理。**同时有一项撤回**：

| A 函中的表述 | 现状 |
|---|---|
| §3.2 "beta 客户端 `karda-beta` 暂缓……beta 主机定后随 B 段一并请求" | **撤回，不再请求**。karda 生产单档，不设 beta 档 |
| §5 "`karda-beta` OIDC 客户端及其三个 URI（连带关闭 TD-001）" | 同上；TD-001 转为**已接受的常驻偏离**，非待办 |

请**不要**注册 `karda-beta` 客户端。A 函 §3.2 请求的生产客户端 `karda` 仍然有效且是唯一需要的。

## 2. 部署参数（已定）

| 项 | 值 | 来源/依据 |
|---|---|---|
| 部署主机 | **worker-02**（tailnet MagicDNS `vx-worker-02`，IP `100.76.219.48`） | owner 2026-07-23 |
| 主机 profile | tailnet 内、**非 VPC** → GHCR 主源 + ACR 兜底 | 治理规范 §5 overseas/非 VPC 行；与 arda 在同主机的做法一致 |
| stack_root | `/srv/md0/karda` | 治理规范 §4 `stack_root = /srv/md0/<product>` |
| `DEPLOY_DIR` | `/srv/md0/karda/deploy` | 精确到含 compose + `.env` 的那一层（治理规范 §6 的 varda 教训） |
| **`APP_PUBLISH_PORT`** | **3233** | worker-02 现有占用：arda prod 3230、arda beta 3231、vxtpl demo 3232 |
| 档位 | **生产单档**，无 beta | owner 决定；见 §4 |

**端口 3233 请在安装 vhost 时顺带核实一次**：以上占用是从 `vxture-arda` 仓的 `deploy/env/*.env`、
`configs/edge/*.conf` 与部署文档推出的，karda 侧无法 SSH 到主机实测。若 3233 已被本仓不可见的服务占用，
请告知改号——karda 侧改动面只有三处（repo 变量 `APP_PUBLISH_PORT`、`configs/edge/karda.vxture.com.conf`
的 `$upstream` 单行、`.env.example`）。

## 3. 请求事项（B 段）

### 3.1 Edge vhost

- [ ] 安装 `karda.vxture.com` vhost，上游 → **`vx-worker-02:3233`**。
      源文件已就绪：本仓 `configs/edge/karda.vxture.com.conf`（照 arda 现行 vhost 同款写法：
      共享 `*.vxture.com` 通配证书、HSTS/XFO/nosniff/Referrer-Policy 四个安全头、
      `client_max_body_size 25m`、`location = /api/usage/flush { return 404; }` 挡内部端点）。
- [ ] **上游写法确认**：文件用 MagicDNS 名 `vx-worker-02:3233` + `resolver 100.100.100.100`。
      arda 的 vhost 注释指出，现行共享 edge nginx 容器**只解析 Docker DNS**，故既有各 vhost 一律
      硬编 IP `100.76.219.48`。若该前置（容器可查 tailscale MagicDNS）仍未就绪，请把
      `set $upstream` 那**一行**改为 `"100.76.219.48:3233"` 后再安装——上游只出现在这一处。
- [ ] DNS：`karda.vxture.com` A/CNAME 指向共享 edge。
- [ ] 主机防火墙：tailscale 接口放行 3233 入站，公网接口封禁该端口（照 arda 部署文档同款处置）。

**无 `beta-karda.vxture.com`**，不需要第二个 vhost。

### 3.2 C3 投递地址登记

- [ ] `product_webhooks` 登记 karda 的 tailnet 投递地址 `KARDA_WEBHOOK_BASE_URL`
      = `http://vx-worker-02:3233`（tailnet 内直达，不经公网 edge）。
      签名密钥 `KARDA_PROVISION_WEBHOOK_SECRET` 已在 A 函 §3.4 请求，此处只补地址。

### 3.3 尚需 owner 手工转运的密钥（karda 侧无法自取）

本仓 `production` 环境已建（含 Required reviewer，reviewer = owner），四个非密值已灌入：
`DEPLOY_HOST=vx-worker-02` / `DEPLOY_USER=stone` / `DEPLOY_PORT=22` /
`DEPLOY_DIR=/srv/md0/karda/deploy`。仍缺：

- [ ] `DEPLOY_SSH_KEY`——worker-02 上对 `stone` 授权的私钥（+ 可选 `DEPLOY_SSH_KEY_PASSPHRASE`）。
- [ ] `DEPLOY_KNOWN_HOSTS`——**必填、不可省**：从可信网络 `ssh-keyscan -p 22 vx-worker-02` 采集。
      复合动作 `tailnet-ssh-connect` 对空 known_hosts **fail-closed**（拒绝 TOFU 回落防 MITM），
      缺此键部署直接失败而非降级。
- [ ] `ENV_FILE_BASE64`——karda `.env` 的 base64（依本仓 `.env.example`：域名 `karda.vxture.com`、
      库 `vxturebiz_karda_prod` / 角色 `karda_svc`、`APP_PUBLISH_PORT=3233`，加 A 函请求的
      OIDC/webhook/job 密钥）。bootstrap 仅在主机无 `.env` 时写入，**已存在则不覆盖**。
- [ ] `KARDA_DB_SVC_PASSWORD`——服务角色口令（对照 arda `production` 环境的
      `ARDA_DB_SVC_PASSWORD`）。
- [ ] 主机侧一次性：`mkdir -p /srv/md0/karda`，并确认 worker-02 上 GHCR / ACR 登录可用。

## 4. 生产单档：偏离声明

治理规范 §4 的产品仓**默认**是两档（`beta-*`→beta、`v*.*.*`→production）。karda 按 owner 2026-07-23
决定**只做生产档**，理由：worker-02 不为 karda 开 beta，且 arda 自身的 beta 栈正在计划清理，karda 不宜
新建一个组织正在退役的档位。

依偏离纪律三步已办：① `deploy.yml` 头部注明条款、原因与"不得擅自加 `beta-*` 触发器"的告警；
② 本仓 TD-001 由"未完成项"改记为**已接受的常驻偏离**（含已接受的代价：无预生产档，`v*.*.*` 是代码
首次上真机，故 `production` 环境的必审人门承担全部上线前把关，回滚是唯一恢复路径）；③ 即本函回报。

**如平台线认为单档不可接受**，请回函说明——karda 会重开该决定，届时需要 beta 主机/端口分配，
并把 `deploy.yml` 的 `stack_root`/`deploy_dir`（现硬编生产路径）改为按环境分支，
`vxture-arda` 的 `deploy.yml` 是现成参照。

## 5. 顺带：两处与 arda 现状的不一致（供平台线核对，非请求）

1. **ACR 兜底端点不一致**。arda `deploy/env/*.env` 里
   `FALLBACK_IMAGE_REGISTRY=crpi-l3l7g186zpo2if7p.cn-hangzhou...` / namespace `agentos`；
   而 org 变量 `ALIYUN_ACR_REGISTRY=crpi-xhjfv6mu59629oau.cn-beijing...`，karda repo 变量
   `ALIYUN_ACR_NAMESPACE=vx-foundation`（owner 2026-07-22 指定）。两套 ACR 实例 + 两个 namespace。
   karda 按 org 变量走；**若 arda 那份才是 worker-02 实际可达的兜底，请指出**——非 VPC 主机以 GHCR 为
   主源，兜底只在 GHCR 不可用时启用，故此不一致平时不显形，出事时才暴露。
2. **`DEPLOY_DIR` 键名**。arda `production` 环境用 `DEPLOY_REPO_DIR`，治理规范 §6 已明定权威键名是
   `DEPLOY_DIR` 并标注 arda 是历史偏差。karda 用标准键名 `DEPLOY_DIR`，两仓不同属预期，
   在此说明以免核对时误判。

## 6. 回复方式

同 A 函：可在本仓或平台仓 `80-liaison/` 回函；密钥值不走文档，由 owner 手工转运至
`vxture/vxture-karda` 的 `production` 环境 secrets。

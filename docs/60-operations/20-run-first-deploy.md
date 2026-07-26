# RUN - 首次生产部署（worker-02）

karda 第一次上真机的**有序**清单。顺序是有讲究的，尤其 §2 的 `.env` 时机——写晚了会踩一个不可逆的坑。

- **目标**：worker-02（`vx-worker-02` / `100.76.219.48`），stack root `/srv/md0/karda`，端口 3240（2026-07-24 改配，原 3233；beta 预留 3241）
- **档位**：仅生产（beta 待专属服务器，TD-001）
- **参数权威**：`docs/50-deployment/20-github-bootstrap-checklist.md`

---

## 0. 当前缺什么（2026-07-23）

CI 侧全部就绪：仓库、ruleset、`production` 环境（必审人门）、`APP_PUBLISH_PORT=3240`、
逐仓 `DEPLOY_DIR`、`ALIYUN_ACR_NAMESPACE`、org 级 `DEPLOY_WORKER02_*` 与 ACR/tailscale/npm 凭据。

**主机指向密钥已是组织级共享**（`DEPLOY_WORKER02_*`，2026-07-27 由旧的裸 `DEPLOY_*`
改名，配一次共享给 worker-02 各仓；工作流保留本地变量名 `DEPLOY_HOST` 等，只把来源换成
`secrets.DEPLOY_WORKER02_*`）。其中两个只有 owner 能产出、且是硬阻断，缺任一 `deploy.yml` 立即失败：

| Secret（组织级） | 产出方式 | 缺了会怎样 |
|---|---|---|
| `DEPLOY_WORKER02_SSH_KEY` | worker-02 上对 `stone` 授权的私钥（+ 可选 `DEPLOY_WORKER02_SSH_KEY_PASSPHRASE`） | "Validate deployment secrets" 步 `test -n` 直接 fail |
| `DEPLOY_WORKER02_KNOWN_HOSTS` | 可信网络执行 `ssh-keyscan -p 22 vx-worker-02` | `tailnet-ssh-connect` 对空值 **fail-closed**（拒绝 TOFU 回落防 MITM），不降级、直接失败 |

`ENV_FILE_BASE64` **不是必需**——只要按 §2 先在主机建好 `.env` 即可，见下。

## 1. 主机侧准备（owner，SSH 到 worker-02）

```bash
mkdir -p /srv/md0/karda/etc
docker login <ACR 端点>        # 主源：国内主机 ACR 更快（deploy.yml 已置 ACR 为主）
docker login ghcr.io          # 兜底
```

同时确认 tailscale 接口放行 3240 入站、公网接口封禁（照 arda 同款处置）。

**Docker registry 镜像加速（国内主机必配）**：worker-02 拉 Docker Hub 基础镜像
（`redis` / `postgres` / `nginx` 等）必须走 registry-mirror，否则会像 2026-07-26 那次
一样卡死。`/etc/docker/daemon.json` 里 `registry-mirrors` 只保留可用的**专属**加速器
（owner 的 `https://vp6xaxdh.mirror.aliyuncs.com`），改后 `sudo systemctl reload docker`
（SIGHUP 热更新，不重启容器）。注意 `mirrors.aliyun.com` 是 apt/yum 源、**不是** docker
registry 镜像，放这里无效；`data-root` 必须保留为 `/srv/md0/docker`。deploy.sh 已改为
"基础镜像本地已存在就跳过拉取、且带超时"，与镜像加速是两道独立保险。

## 2. 写 `.env` —— 必须在首次部署**之前**

**路径固定**：`/srv/md0/karda/etc/.env`，权限 `600`。

> **⚠ 时机陷阱（不可逆）**
> `deploy.yml` 的 bootstrap 步逻辑是：主机上**没有** `.env` 就从 `ENV_FILE_BASE64` 写一份；
> **已存在则不覆盖**。若此时 `.env` 不存在、而 `ENV_FILE_BASE64` 又是空的，它会写出一个
> **空 `.env`** 并 `chmod 600`——之后每次部署都判定"已存在、跳过"，**再也不会自动补写**。
> 结果是应用带着零配置起来，而且不会有任何报错指向根因。
>
> 所以：**要么** §2 先把 `.env` 写好（推荐，owner 已说明要直接写主机），**要么**提供完整的
> `ENV_FILE_BASE64`。两者都不做就会掉进上面这个坑。

内容以本仓 `.env.example` 为准（它是唯一权威键清单）。首次部署必须填实的：

| 键 | 值 / 来源 |
|---|---|
| `APP_PUBLISH_PORT` | `3240` |
| `NEXT_PUBLIC_APP_URL` / `OIDC_REDIRECT_URI` / `OIDC_POST_LOGOUT_REDIRECT_URI` | `karda.vxture.com` 域下，见 `.env.example` |
| `OIDC_CLIENT_ID` | `karda` |
| **`OIDC_CLIENT_SECRET`** | 平台线已发放（owner 手上）。**注意**：它虽已写入本仓 repo secret，但部署链没有任何一步读它，且 GitHub secret 只写不可读回——所以必须在这里手工填入，仓库里那份是无效的（见 `80-liaison/50-2607230957` §2.1） |
| `POSTGRES_PASSWORD` / `DATABASE_URL` 中的口令 | `KARDA_DB_SVC_PASSWORD`，owner 自定 |
| **`PLATFORM_INTERNAL_AUTH_TOKEN`** | 平台 env 的 `AUTH_INTERNAL_TOKEN` 同值（arda `.env.example` §100-103 同款语义），作为 `x-vxture-internal-auth` 头发出 |
| **`PLATFORM_API_URL`** | 平台内网基址。**必须是 tailnet 形态**：`100.x.x.x` IP 或 https；裸 MagicDNS 短名（如 `vx-worker-01`）会被 `internal-target.ts` 的出网守卫拒绝 |
| `PROVISION_WEBHOOK_SECRET` | 归 B 段，未发放——**可暂时留空**，C3 入站校验会拒绝所有 webhook，不影响本次上线 |
| `INTERNAL_JOB_TOKEN` | owner 自定，门控 `POST /api/usage/flush` |

`PLATFORM_API_URL` 或 token 留空 → C2 回落 Mock：所有 workspace 读作"未订阅"。这与平台侧
五档骨架仍为 DRAFT 的现状**一致**，因此首次上线读到"未订阅"是预期，不是故障。

## 3. 确认组织级密钥可见性（owner，GitHub）

主机指向密钥现为**组织级**，配一次即共享给 worker-02 各仓——不再逐仓 `--env production` 设置。
本仓只需确认在可见范围内即可（已含）。若首次产出这两个 owner 密钥，用组织级设置：

```
gh secret set DEPLOY_WORKER02_SSH_KEY     --org vxture --visibility selected < <私钥文件>
gh secret set DEPLOY_WORKER02_KNOWN_HOSTS --org vxture --visibility selected < <keyscan 输出>
# 然后把 vxture-karda 加入这两个密钥的可见仓库列表（GitHub UI 或 gh api）
```

## 4. 发布（可由 agent 执行）

```
git tag v0.1.0 && git push origin v0.1.0
```

`deploy.yml` 随即 build → 在 `production` 环境**暂停等审批** → owner 在 GitHub 点 Approve →
rsync 投递 `deploy/`+`configs/`+`compose` → 拉不可变 `sha-<short>` 镜像 → `deploy.sh all`。

**审批是 owner 手点，agent 只触发不自审。**

## 4b. 已踩过的两个坑（v0.1.0 首次尝试，2026-07-23）

**① `.env` 陷阱真的触发了。** 首次批准时主机上 `/srv/md0/karda/etc/.env` 尚不存在、
`ENV_FILE_BASE64` 为空，bootstrap 按设计创建了一个**空 `.env`**（日志 `[bootstrap] .env created`）。
它不会自我修复：此后每次部署都判定"已存在、跳过"。**处置**：手工把真实内容覆盖写入该路径即可，
覆盖后 bootstrap 继续跳过、不会再动它。§2 的顺序要求正是为了避免这一步。

**② 用 Git Bash 设"值以 `/` 开头"的 secret 会被 MSYS 路径转换毁掉。**
`gh secret set DEPLOY_DIR --body "/srv/md0/karda/deploy"` 在 Git Bash 下，值会被改写成
`<Git 安装盘符>/Program Files/Git/srv/md0/karda/deploy`，远端 `deploy.sh` 据此推出的 `ROOT` 错误，
报 `missing .../etc/.env`。**处置**：用 PowerShell 设置、GitHub 网页 UI 设置，或在 Git Bash 前置 `MSYS_NO_PATHCONV=1`。
只有 `DEPLOY_DIR` 受影响；`DEPLOY_WORKER02_HOST`/`USER`/`PORT` 不以 `/` 开头不受影响，
经 stdin 写入的 `DEPLOY_WORKER02_KNOWN_HOSTS` 也不受影响。

**已加机检**（2026-07-23，此坑二次险些复发后）：`deploy.yml` 的 "Validate deployment secrets"
步现在断言 `DEPLOY_DIR` 必须是绝对 POSIX 路径且不含 Windows 路径片段，**几秒内失败**，
不再需要走完 build + 审批 + SSH 才在远端报 `missing .../etc/.env`。空值仍允许
（部署步回落 `/srv/md0/<code>/deploy`）。

## 5. 验收

- `deploy.sh verify`：容器内 `GET /api/health` 返回 200（该路由零依赖，**DB 未初始化也应通过**）
- 主机 `cat /srv/md0/karda/deploy/VERSION` == 本次部署的 SHA
- `docker ps` 有 `karda-app` / `karda-redis` / `karda-db`
- 边缘就绪后：`https://karda.vxture.com` 可达（vhost 安装归平台线，`80-liaison/40-2607230909`）

## 6. 首次部署**之后**才做的两件事

1. **DB 结构**：走 `db-init.yml`（`confirm=yes` + `expected_sha` 钉版本 + `production` 审批门），
   **绝不走部署链**。在此之前应用连不上业务表属正常。
2. **平台线建议的自测**（`80-liaison/40-2607230130` §3）：OIDC 登录闭环走一遍
   authorize→token 交换；C2 探针 `GET /entitlements?workspace_id=<ws>&product=karda`
   预期落"未订阅"分支。结果回函平台线。

## 7. 回滚

`rollback.yml`，拉指定的不可变 `sha-<short>` 镜像重建 app 容器（不重建整栈）。
上一版 SHA 见主机 `/srv/md0/karda/deploy/VERSION` 或 `gh run list --workflow deploy.yml`。
**无预生产档意味着这是唯一恢复路径**（TD-001 记录的过渡期风险）。

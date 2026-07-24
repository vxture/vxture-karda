# karda → 平台线：生产端口改配（3233 → 3240，beta 预留 3241）

> **发件**：vxture-karda（产品线）
> **收件**：平台线（owner / 平台控制面 / 边缘）
> **时间**：2026-07-24 17:49（stamp 2607241749）
> **主题**：karda 发布端口改配——prod `3240`、beta `3241`；修订 B 函 `40` 中的 `3233`
> **状态**：open（平台侧正在同步修改）
> **前序**：`40-2607230909-karda-platform-registration-b.md`（B 段，仍 open）
> **依据**：owner 2026-07-24 定：karda 端口按产品号对齐——prod=3240、beta=3241

---

## 1. 变更摘要

B 函 `40` 按当时 worker-02 的既有占用把 karda prod 分在 **3233**。现按 owner
2026-07-24 决定，karda 发布端口改为按产品号（240）对齐：

| 档 | 原值 | 新值 | 说明 |
|---|---|---|---|
| prod | 3233 | **3240** | worker-02 上运行，本次改配 |
| beta | （未分配） | **3241** | 仍为预留发布通道，随 beta 服务器启用（TD-001），本函不请求现在启用 |

容器内部监听端口不变，仍为 `3000`；改动的只是宿主发布端口
（`APP_PUBLISH_PORT`）与其下游。

## 2. karda 侧已改动（本仓，随本函 PR 合入）

- `.env.example`：`APP_PUBLISH_PORT=3240`，并标注 `BETA OVERRIDES: 3241`。
- `configs/edge/karda.vxture.com.conf`：上游 `set $upstream` → `vx-worker-02:3240`
  （MagicDNS 不可达时的兜底 IP 行也改为 `100.76.219.48:3240`）。
- `configs/edge/README.md`、`.github/workflows/deploy.yml` 头注、部署与登记文档
  （`50-deployment/10`、`50-deployment/20`、`60-operations/20`、`70-workplan/00`）
  中的 `3233` 一并改为 `3240`，并记录改配日期与 beta 3241 预留。

`docker-compose.yml` 已参数化（`${APP_PUBLISH_PORT}:3000`），无需改动。

## 3. 仍需 owner / 平台侧同步的动作

karda 仓改不动运行态的两处（仓库改动面之外），请 owner / 平台侧落实：

1. **GitHub 仓库变量** `APP_PUBLISH_PORT` = **3240**（原 3233）。deploy.yml 不注入该
   值，宿主 compose 从宿主 `.env` 读取，故还需——
2. **宿主 `.env`**（`/srv/md0/karda/etc/.env`）：`APP_PUBLISH_PORT=3240`，改后重拉栈。
3. **edge vhost** `karda.vxture.com` 上游 → **`vx-worker-02:3240`**（本函附的 `.conf`
   已是该值，随边缘 nginx-sync 安装即可）。
4. **宿主防火墙**：tailscale 接口放行 **3240** 入站、封禁旧 **3233**；公网接口对两者均封禁。
5. **`product_webhooks`** 投递地址 `KARDA_WEBHOOK_BASE_URL` → `http://vx-worker-02:3240`。

beta（3241）本次不办理，随 beta 服务器启用时随 `karda-beta` 一并请求。

## 4. 对 B 函 `40` 的影响

本函**修订** `40` 中所有 `3233` 为 `3240`；`40` 的其余请求（webhook 登记、密钥转运、
两处与 arda 的差异标注）不变，仍 open。`40` 作为历史函件不追改，以本函为准。

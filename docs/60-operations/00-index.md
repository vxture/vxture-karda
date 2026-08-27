# 60-operations - Runbooks, audits, tech debt, incidents

Operational material for this repo: runbooks, audits, the tech-debt register, and
incident notes.

| File | Purpose |
|------|---------|
| `10-tech-debt.md` | tech-debt register (`TD-NNN`, append-only, stable IDs). Path pinned by org taxonomy section 4 |
| `20-run-first-deploy.md` | ordered runbook for karda's first production deploy on worker-02, including what is still blocked and the `.env` timing trap |
| `30-run-aliyun-migration.md` | move karda's data to Aliyun cloud (KD-019): OSS for raw knowledge bytes (adapter shipped), RDS for `vx_karda_db`, own-instance Redis (optional, last, never shared with the platform's) |
| `40-run-atlas-endpoint-grants.md` | 给产品 `karda` 授四个 Atlas 端点(产品轴,不需要租户 uuid)。一次性运维操作,karda 侧零改动。**没有 `embedding/default` 时 karda 的语料为零**——不是降级,是加工管线提交不了 |
| `50-run-transfer-kb-owner.md` | 把 U 级库转给新属主(TD-005)。以**库属主**身份跑,不是 `karda_svc`——`owner_sub` 的列锁**没有放宽**,那正是这条路径存在的理由 |

Runbooks are `NN-run-{slug}.md` (org taxonomy section 4, calibrated 2026-07-22 -
the earlier `run-{domain}-{slug}.md` form could not pass the numbering guardrail).

# 50-run-transfer-kb-owner - 把 U 级库转给新属主(TD-005)

> **执行方**:持有**库属主 DSN** 的人(不是 `karda_svc`,不是应用)。
> **脚本**:`deploy/database/ops/transfer-kb-owner.sql`。
> **场景**:属主离职/转岗,其 U 级库需要交给他人(产品定义 4.6:由 home WS 管理员发起)。

---

## 1. 为什么这件事不在应用里

`owner_sub` 在 `98_column_locks.sql` 里被**列锁**挡着,`karda_svc` 改不了它。这不是遗漏:

> 把这个写权交给运行时服务角色,等于把治理设计**刻意不给**的能力发给它。缺口本身是
> 正确状态,缺的是那条**特权路径**。

所以路径长这样:**应用负责判断「谁可以提这个请求」,数据库属主负责执行「这一行可以改」**
——两半刻意分开,而且两边用同样的措辞表达同样的拒绝(`ownership.ts` 的
`canTransferOwnership` 与脚本里的 `RAISE EXCEPTION`)。

**一处必须说清楚的后果**:这条路径由运维执行,而运维不是一个会话,**所以「只有 home WS
管理员可以转移」这条规则在运行时没有任何地方强制**。真正的闸门是**执行者本人**——
他持有属主 DSN,并且应当先确认请求来自 home WS 管理员。`canTransferOwnership` 在这里
的作用是**写明谁有资格提**,不是拦住谁。

想把这条也变成机器闸门,得给脚本套一个带审批人的 workflow(像 `production` 环境那样)。
**现在没有**,不要以为有。

## 2. 前置

| 需要什么 | 说明 |
|---|---|
| 库属主 DSN | 不是 `karda_svc`。服务角色跑这个脚本会因列锁失败——这是设计,不是配置错 |
| `kb_id` | 目标库的 uuid |
| `new_owner` | 新属主的 subject(与 `owner_sub` 同一口径) |
| 请求来源确认 | 见 §1:这一条靠人 |

## 3. 执行

```bash
psql "$OWNER_DSN" -v ON_ERROR_STOP=1 \
  -v kb_id='<uuid>' -v new_owner='<subject>' \
  -f deploy/database/ops/transfer-kb-owner.sql
```

脚本会打印**转移前**和**转移后**两行。**把这两行留存**——它们就是这次操作的审计记录,
而这条路径绕过了应用的审计面(那正是 §1 那个代价)。

## 4. 它会拒绝什么(真库实测,2026-08-27)

| 情形 | 结果 |
|---|---|
| 正常转移 | `NOTICE: library <id> transferred from alice to bob`,前后两行打印,`exit 0` |
| **同一条再跑一遍** | `NOTICE: ... is already owned by bob - nothing to do`,`exit 0`——**幂等,且不谎报「已转移」** |
| 非 U 级库 | `ERROR: only user-tier libraries have a personal owner to transfer (this one is tenant)`,`exit 3` |
| `new_owner` 为空 | `ERROR: new_owner is empty - refusing to orphan a library`,`exit 3` |
| 库不存在 | `ERROR: no library with id ...`,`exit 3` |
| 库已软删 | `ERROR: ... is soft-deleted; restore it before transferring` |

四个拒绝分支都在事务里 `RAISE EXCEPTION`,**整笔回滚**——实测确认拒绝之后目标行没有变化。

## 5. 两个容易踩的地方

**脚本不会被 `apply.sh` 捡走。** 那个脚本只应用三个基线文件和 `ddl/incr/*.sql`,`ops/` 下
的东西永远不会自动执行——**一次能被例行 db-init 触发的属主转移会是很糟的事故**。

**参数是用 `set_config(..., true)` 传进去的,不是插值。** psql **不会**在美元引用的
`DO $$ ... $$` 体内替换 `:变量`,写在里面会原样发到服务端,报一个让人摸不着头脑的错。
改脚本时别把这个改回去。

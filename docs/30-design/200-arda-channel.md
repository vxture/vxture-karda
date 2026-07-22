# Karda × Arda 内容通道契约(Content Channel Contract)(200-arda-channel)

> 版本:v0.1(跨产品评审草案 — **需 Arda 侧对齐后定稿**)
> 上游文档:product_110(连接=Arda、理解=Karda;属主拉动;级联撤销)、product_210 v1.0(S2S 身份、C3 webhook 域)、100-kb-model(Document 对象、failed 驻留、source_ref 血缘)、120-retrieval-tools(可见集失效事件为邻接契约)
> 定位:定义 Arda(连接方)与 Karda(理解方)之间非结构化内容的绑定、交付、增量、删除与撤销语义;是"连接=Arda、理解=Karda"边界的可执行化
> 设计方法:按行业最佳实践设计——最小摄取契约(稳定 ID/源指针/时间戳/访问属性)、增量同步 + 变更检测、notify-then-pull、at-least-once + 幂等、墓碑删除、原始留存与全程血缘

---

## 1. 目标与非目标

**目标**:让"属主在 Karda 建库并绑定 Arda DataSource"之后,内容的首次全量(backfill)、持续增量(incremental)、删除与共享撤销,在两产品间以明确定义的契约自动流转;每一份进入 Karda 的内容可追溯到源、可确定性更新与删除。

**非目标**:不定义 Arda 连接器如何对接外部系统(Arda 内部事务);不定义 Karda 解析/分块/索引(110-processing);不引入中心消息总线(变更通知走 C3 webhook 域,内容传输产品间直连,遵循 product_110 §7 唯一直连原则);结构化数据服务不走本通道(Arda 数据服务面自理)。

## 2. 职责划分(行业对应:connector 层 vs indexing 层)

| 方 | 职责 | 行业对应 |
|---|---|---|
| **Arda(连接方)** | 源系统认证、分页、限流;**变更检测**(cursor/CDC/内容 hash,判定新增/修改/删除);同步调度;交付信封的组装与稳定 ID 保障;共享撤销事件发出 | connector 框架承担认证、分页、增量检测与错误恢复的行业分工 |
| **Karda(理解方)** | 通知消费、内容拉取、按 hash 幂等去重、解析/分块/索引(110-processing)、failed 驻留与重试、撤销级联失效 | offline indexing workflow(与在线检索分离) |
| **属主** | 建库、绑定 DataSource(发起同步关系)、处理失败件 | 属主拉动原则(product_110) |

## 3. 通道模型:Binding

```
Binding = KnowledgeBase(Karda 侧) ←订阅→ DataSource(Arda 侧)
  ├── 创建:属主在 Karda 建库流程中选择其可及的 Arda DataSource;
  │        Karda 以 OBO 身份调用 Arda 登记订阅(Arda 侧校验属主对该 DataSource 的权限)
  ├── 关系:多对多(一库可绑多源;一源可被多库订阅——各 Binding 独立 cursor)
  ├── 模式:backfill(建绑后首次全量,分批)→ incremental(常驻增量)
  ├── 状态:active / paused(属主暂停) / revoked(源侧撤销,不可恢复,触发级联 §7)
  └── 检查点:cursor(Arda 维护同步位点)+ Karda 侧消费位点,双方可对账
```

## 4. 交付契约:ContentEnvelope(最小摄取契约)

行业结论直接采纳:最小摄取契约 = 稳定 ID + 源指针 + 时间戳 + 访问属性,四者齐备检索层才可治理。信封 schema(v1):

```jsonc
{
  "envelope_version": "1.0",
  "event": "upsert" | "delete" | "revoke_binding",
  "binding_id": "...",
  "source_doc_id": "...",        // 【稳定 ID】Arda 保障:同一源对象跨同步周期恒定
  "content_hash": "sha256:...",  // 变更判据与幂等键(delete/revoke 事件无此字段)
  "source_ref": {                // 【源指针】= 100-kb-model 血缘字段的通道来源形态
    "datasource_id": "...", "uri": "...", "external_version": "..."
  },
  "timestamps": { "source_modified_at": "...", "detected_at": "..." },  // 【时间戳】
  "content": {                   // upsert 时存在;notify-then-pull 下为拉取凭据而非载荷
    "mime": "...", "size": 1234,
    "fetch_ref": "arda://content/{token}"   // 短时效拉取引用,Karda 直连 Arda 取件
  },
  "source_metadata": { ... }     // 源侧元数据透传(作者/路径/标签…),Karda 落业务段候选
                                 // 【访问属性】v1 不透传源侧 ACL,见 §9 边界说明
}
```

## 5. 传输语义:notify-then-pull + at-least-once + 幂等

- **notify-then-pull**:变更通知(轻量信封,不含内容载荷)经 **C3 webhook 域**投递 Karda;内容本体由 Karda 凭 `fetch_ref` **直连 Arda 拉取**(service 模式 S2S token,aud=arda)。理由:事件通道不承载大载荷(行业通行);数据面保持产品直连(product_110 铁律);拉取可按 Karda 加工吞吐自然背压;
- **at-least-once + 幂等**:通知可能重复,Karda 以 `(binding_id, source_doc_id, content_hash)` 幂等——hash 未变直接 ack 跳过(同时覆盖"源改了又改回"的伪变更);
- **顺序**:仅承诺**同一 source_doc_id 内按 detected_at 有序**,跨文档不承诺全局序(按文档为单元处理即可,行业标准弱化);
- **重试与死信**:投递失败指数退避重试(上限后进 Arda 侧死信,Console 可见);Karda 拉取失败/解析失败 → 文档落 `failed` 驻留态(100-kb-model §5.1),属主可见可重试,**不阻塞同 Binding 其他文档**(毒丸隔离);
- **对账**:双方位点可查;Binding 级"一致性核对"接口(source_doc_id + hash 清单比对)供定期校验与故障恢复,替代盲目全量重灌。

## 6. 变更检测与增量(Arda 义务)

- 增量为默认常态,**只处理 delta**——全量重处理不可扩展是行业一致结论;变更检测器由 Arda 按源类型实现(API cursor / CDC / 内容 hash 轮询),对 Karda 表现为统一的 upsert/delete 事件流;
- **删除 = 墓碑事件**(`event: delete`):Karda 收到即对该 source_doc_id 的 Document 执行索引级联清除(血缘保留审计期);源侧"移出同步范围"(如文件移出被订阅目录)等价于 delete;
- backfill 与 incremental 同一信封同一语义,仅批次密度不同——Karda 侧零特殊处理;
- 源 schema/结构漂移由 Arda 吸收(连接器职责),不上升为信封变更;信封自身演进见 §10。

## 7. 撤销与级联(lineage-aware revocation 落地)

`revoke_binding` 事件(源侧撤销共享 / DataSource 删除 / 属主权限丧失)触发:

1. Karda 将 Binding 置 revoked(终态);
2. 该 Binding 血缘下全部 Document/Chunk/Index **同步不可见**(召回白名单层立即排除——不等待清除完成);
3. 异步物理清除,血缘记录保留至审计期;
4. 与 120-retrieval-tools §3 可见集失效事件**分工**:revoke_binding 管"内容级联失效"(本契约),visible-set-invalidate 管"授权视图失效"(平台侧)——两事件独立投递,Karda 分别消费,任一先到都不产生泄漏窗口(召回前双重检查:白名单 ∧ 内容可见)。

## 8. 身份与鉴权(product_210 落地)

- 通知投递:C3 webhook 域标准鉴权(平台侧既有机制);
- 内容拉取:Karda→Arda,service 模式 S2S(`aud=arda`,`act.sub=karda`),携带调用上下文 org/ws;`fetch_ref` 短时效(≤300s,对齐 token TTL)、单资源、不可转用;
- Binding 登记:Karda→Arda,**OBO 模式**(属主身份)——订阅关系的建立必须以属主权限校验,后续增量运行才切 service 模式(与 120-retrieval-tools "创建类动作仅 OBO"同源);
- Arda 作为 provider 遵守 RP 八条纪律;双方互不信任 token 之外的上下文。

## 9. 边界说明(v1 明确不做)

- **不透传源侧 ACL**:行业(Glean)会同步源系统权限做检索期过滤;我们的授权模型是 Karda 库级发布阶梯 + 可见集,**库是权限单元、源 ACL 不映射**——绑定了源的库,其可见性由库的发布状态决定,与源内细粒度权限无关。此为有意简化:属主绑定源即承诺该源内容以库为单元治理;源内含差异密级内容的正确用法 = 拆 DataSource 范围或拆库。信封保留 `source_metadata` 透传位,v2 若引入源 ACL 映射不破坏契约;
- 不做 Karda→Arda 反向内容回写(知识不回流数据域);
- 不做实时(秒级)同步承诺:增量延迟目标分钟级(具体 SLO 随 Arda 连接器类型声明)。

## 10. 版本演进与错误约定

- `envelope_version` 随信封声明;新增字段向后兼容,语义变更升版双版本过渡(对齐 product_210 §7);
- 错误封套复用 product_210 统一格式;拉取面语义:`401`(token 过期→重换)/ `403`(Binding 已 revoked→停止拉取并触发 §7)/ `404`(fetch_ref 过期→凭 source_doc_id 重新请求引用)/ `429`(限流→退避)。

## 11. 计量

- 拉取与同步流量:双方各自基础设施成本,不进业务计量;
- Karda 摄取计量:`karda.ingest` per_doc(经 C3,记属主 WS)——与工具面写入同指标,来源以维度区分(upload/api/arda_sync);
- Arda 侧同步计量归 Arda 自报(其 DataSource 服务面指标),互不重复。

## 12. 待评审项(Arda 侧对齐清单)

| # | 项 | Karda 侧立场 | 需 Arda 确认 |
|---|---|---|---|
| 1 | 稳定 ID 保障强度 | source_doc_id 跨周期恒定为硬契约 | 各连接器类型能否保障(如文件移动/重命名场景的 ID 策略) |
| 2 | fetch_ref 形态 | 短时效凭据化引用 | 签发与校验机制归 Arda 实现,时效与单资源约束确认 |
| 3 | 一致性核对接口 | Binding 级清单比对(id+hash) | 接口成本与频控约定 |
| 4 | 增量延迟 SLO | 按连接器类型分级声明 | 各源类型的可承诺档位 |
| 5 | 死信可见面 | Arda Console 呈现投递死信 | 与 Karda failed 态的联合排障视图是否需要打通 |

## 13. 联动登记

- 110-processing(加工管线):消费本契约 upsert 流的解析/分块/索引实现;failed 驻留与重试的工程细节;
- 120-retrieval-tools §3:visible-set-invalidate 与本契约 revoke_binding 的双事件分工已在 §7 固化;
- product_310/C3:webhook 域投递本契约通知的通道登记;
- product_110:级联撤销原则(§10-#2)由本契约 §7 落为可执行语义。

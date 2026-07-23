# Karda 检索管线与工具面(Retrieval & Tool Surface)(120-retrieval-tools)

> 版本:v0.1
> 状态:Draft — 待拍板项 5 项(见 §10)
> 上游文档:10-product-definition v0.3、100-kb-model v0.1、product_110(含用户维度增补 v2)、product_210 v1.0
> 定位:Karda 文档族第二份纵深设计,定义检索求值链、跨命名空间联合召回、可见集缓存、关联清单的 API 表达,以及 v1 工具面清单与 schema 要素(product_210 实现清单)
> 设计方法:关键决策按行业收敛模式裁定(RRF 融合 = Elastic/Azure AI Search/OpenSearch 标准;召回廉价、精排一次 = 两阶段检索通行范式;身份定范围 = Glean 模式)

---

## 1. 检索求值链(总览)

```
请求(S2S token + query + 入参)
  │ ①验签,取四元组 (org, ws, product, user?)          [product_210 §3.3 八条纪律]
  ▼
② 范围求解:可见集(C2,缓存 §3) ∩ 关联清单(服务端存储 §4)
           ∩ 可选 kb_ids 收窄入参(只能收窄,不能扩权)
           → 得召回白名单 {kb_id...},按命名空间分组(org / 平台)
  ▼
③ 双路召回(每命名空间):向量 top-N + BM25 top-N        [召回层硬过滤:白名单 + content_state=indexed
                                                        + verification_filter 档位 + filterable 条件]
  ▼
④ RRF 融合(命名空间内,倒数排名融合,免分数归一)
  ▼
⑤ 统一精排:全命名空间候选并集 → rerank(经 Atlas,cross-encoder)
           —— 跨命名空间分数不可比,合并只在精排层发生("召回廉价,精排一次")
  ▼
⑥ 组装返回:top-k 结果 + 引用溯源(§5) + 治理/来源标注;计量上报(C3,异步)
```

失败降级约定:rerank 不可用 → 回退 RRF 序并在响应标注 `degraded: rerank_unavailable`;单命名空间超时 → 返回可用部分并标注 `partial: true`(平台命名空间故障不阻塞租户内容返回,反之亦然)。

## 2. 跨命名空间联合召回(设计裁定)

**裁定:各命名空间独立召回 top-N → 候选并集 → 单次统一 rerank 出全局序。** 不做跨索引分数归一合并。

理由(行业共识):不同索引的向量相似度与 BM25 分数量纲不可比,归一化脆弱;cross-encoder 精排对同一 query-doc 对打分,天然全局可比——两阶段"召回廉价、精排一次"是 Elastic/Azure/Vespa 一致范式。RRF 仅用于**命名空间内**双路(向量/BM25)融合,同为三家标准做法。

参数约定:每命名空间召回 N=50(向量/BM25 各 50,RRF 后取 50 入精排池);精排池上限 = 命名空间数 × 50(v1 最多 2 空间 = 100);最终 top_k 默认 10,库级可配。平台命名空间(live P 包)候选不做数量保护性配额——精排统一裁决,若平台内容长期挤占租户结果属内容相关性事实,不做人工加权(待拍板 #3 记录此裁定供复议)。

## 3. 可见集缓存与失效

**裁定:事件失效为主 + 短 TTL 兜底(混合制)。**

- Karda 本地缓存 C2 可见集响应,键 = (org, ws, product, user);TTL = 300s(与 S2S token TTL 对齐,直觉一致:一次令牌生命周期内视图稳定);
- **平台变更事件推送失效**(撤回发布、grant 吊销、entitlement 变更、P 包退订):经平台事件通道(C3 webhook 域)推送 `visible-set-invalidate(键)`,Karda 收到即删缓存条目——保障"撤销即时生效"的产品承诺不受 TTL 窗口拖延;
- 事件通道不可用时退化为纯 TTL(最坏 300s 收敛),可接受且须写入 SLA 表述;
- 变更事件契约为**平台侧登记项**(C2/C3 域,随 product_310 切分),Karda 侧仅实现消费端。

## 4. 关联清单的 API 表达(设计裁定)

**裁定:关联清单为服务端状态(Karda 存储,键 user × product),检索工具默认不传库列表——范围由身份服务端解析。**

- 对标 Glean:检索范围由身份决定,调用方零配置;避免 agent 侧各自维护库列表导致的漂移与越权面;
- 工具提供可选 `kb_ids` 入参用于**临时收窄**(单库问答等场景),语义为 `kb_ids ∩ 关联 ∩ 可见`——只能收窄,永不扩权;传入不可及的 kb_id 静默忽略并在响应 `ignored_kb_ids` 中回显(便于 agent 排障,不构成存在性探测:仅回显调用方自己传入的 id);
- 关联清单归属澄清:清单是**消费侧配置**而非授权数据,存 Karda(区别于 grant/发布状态存平台侧)——它不参与安全判定(安全由可见集保证),仅参与范围求解,故不违反"Karda 不自建授权存储"约束;
- product 预置库由 agent 以自身身份(service/OBO 均可)经 `kb_ids` 显式并入,不入用户关联清单(承接 product_110 D5)。

## 5. 引用溯源返回结构

召回单元(Chunk / Entry)统一返回:

```jsonc
{
  "content": "...",                         // 召回文本
  "score": 0.87,                            // 精排分(降级时为 RRF 序号折算,见 degraded 标记)
  "ref": {
    "kb_id": "...", "kb_name": "...", "kb_tier": "U|T|P",
    "doc_id": "...", "doc_title": "...",    // Entry 时为 entry_id/模板名
    "chunk_id": "...", "locator": {...},    // 页码/段落偏移等,加工模板决定粒度
    "source_ref": "...",                    // 血缘:Arda DataSource / 上传 / api
    "package": { "id": "...", "version": "..." }   // 仅 live P 包内容,标注包与版本
  },
  "governance": { "verification_state": "...", "verified_at": "...", "verifier": "..." },
  "metadata": { ... }                       // filterable 业务字段回显
}
```

scope 语义执行:token 侧 grant scope=retrieve 的库,其内容仅经带 ref 的检索面返回;scope=apply 方允许消费方无引用生成(Karda 不技术性阻止下游去引用,但审计记录 scope,违约属治理面)。

## 6. v1 工具面清单(product_210 实现)

命名空间 `karda.*`;全部经 `GET /.well-known/vxture-tools` 发布;semver 1.0.0 起步。

| 工具 | 功能 | 模式 | metering | 关键入参 |
|---|---|---|---|---|
| `karda.search` | 混合检索(联合召回) | OBO/service | `karda.search` per_call | query, top_k?, kb_ids?, verification_filter?, filters?(白名单字段) |
| `karda.ask` | 单轮带引用问答 | OBO/service | `karda.ask` per_call(模型 token 归 Atlas) | question, top_k?, kb_ids?, verification_filter? |
| `karda.list_kbs` | 列出可见/已关联库(含 tier、治理策略摘要) | OBO/service | 免计量 | filter?(attached\|visible) |
| `karda.attach_kb` / `karda.detach_kb` | 维护当前 user × product 关联清单 | **仅 OBO** | 免计量 | kb_id |
| `karda.create_kb` | 创建 U 级库(创建现场自动关联,承接 D5) | **仅 OBO** | 免计量(存储另计) | name, processing_template?, home_ws 取 token |
| `karda.write_document` | 写入文档(知识沉淀路径) | **仅 OBO**(v1) | `karda.ingest` per_doc | kb_id, content/file_ref, template_override? |
| `karda.create_entry` | 按 ContentTemplate 写入条目 | **仅 OBO**(v1) | `karda.ingest` per_doc | kb_id, template_id, fields |

要点:

- **仅 OBO 约束**:创建/关联/写入均为用户语义动作,service 模式一律拒绝(`403 access_denied`)——与"service 不可触达 private"同源的硬规则;v1 写入面不开 service(Arda 同步走内部通道非工具面),避免后台任务替用户造资产;
- 库管理深水区(删库/发布/晋升/移交/治理配置/实例化)**不进工具面**,归 Console 与管理 API——发布与治理是审慎动作,不宜置于 agent 可自动化路径(待拍板 #4 记录);
- 描述符 `authz.asset_types` 统一 ["knowledge_base"];错误封套与 401/403/409 语义遵循 product_210 §7;
- `karda.ask` 与 `karda.search` 共享范围求解与召回实现,ask 仅多一段经 Atlas 的生成;生成配额受调用方 WS 约束,配额尽 → `409 quota_exhausted`。

## 7. 性能预算(v1 目标,非 SLA)

| 段 | 预算 P95 |
|---|---|
| 范围求解(缓存命中) | < 10ms(未命中 + C2 往返 < 80ms) |
| 双路召回 × 2 命名空间(并行) | < 150ms |
| rerank(经 Atlas,100 候选) | < 400ms |
| `karda.search` 端到端 | < 700ms |
| `karda.ask` 端到端(不含流式生成首 token 后) | 检索段同上 + 生成经 Atlas |

预算兑现依赖:grant 物化(平台侧)、可见集缓存(§3)、命名空间并行召回、rerank 批量化。超预算的首要嫌疑按序排查:精排池过大 → 降 N;可见集过大(用户关联库过多)→ 引导清单收敛(Console 提示)。

## 8. 安全红线(实现自查清单)

召回白名单先于任何检索执行(无白名单不查索引);`kb_ids` 只收窄;service 无 sub 即无 private;平台命名空间查询不携带租户内容、返回不落租户数据出 org;结果不含白名单外任何 kb 的存在性信息;审计记录 (jti, 工具, 白名单摘要, 档位);降级路径(rerank 失败/部分命名空间失败)不得绕过白名单。

## 9. 对标速查

| 设计点 | 采纳来源 |
|---|---|
| RRF 命名空间内双路融合 | Elasticsearch / Azure AI Search / OpenSearch 标准 |
| 候选并集 + 单次统一精排(跨索引不归一分数) | 两阶段检索通行范式(Elastic/Vespa 等) |
| 范围由身份服务端解析,API 零库配置 | Glean |
| 可选显式库列表收窄 | Dify 应用绑定数据集的反向改良(它是绑定,我们是收窄) |
| 事件失效 + TTL 兜底 | 权限缓存通行做法(Glean 近实时 ACL 更新) |
| 降级标注(degraded/partial) | 搜索服务通行契约 |

## 10. 待拍板项

| # | 决策项 | 说明 | 倾向建议 | 状态 |
|---|---|---|---|---|
| 1 | 召回参数基线 | N=50/空间、精排池 100、top_k=10 | 起步值(精排池另受 KD-102) | **已定 KD-009** |
| 2 | 可见集失效事件契约 | 平台事件通道的消息格式与投递语义 | 平台 product_310 定义 | 外部 KD-103 |
| 3 | 平台内容配额保护 | live P 包内容是否设结果占比上限 | 不设,留复议位 | **已定 KD-012** |
| 4 | 工具面边界 | 发布/晋升/删库等是否永不进工具面 | v1 不进 | **已定 KD-006** |
| 5 | filters 入参能力 | 业务 filterable 字段的查询算子集 | v1 等值与 in | **已定 KD-010** |

## 11. 联动修订登记

- 100-kb-model §5.3/§6:verification_filter 与召回过滤维度在本文 §1/§6 落地,双向一致已核;
- product_210 实现:§6 工具清单即 Karda 的 `/.well-known/vxture-tools` 初版内容;
- 平台侧登记(product_310):C2 可见集用户维度(既有)+ 本文新增可见集失效事件通道;
- 110-processing(加工管线):`karda.write_document/create_entry` 的落库路径、failed 驻留、增量更新为其范围;
- Console 需求:关联清单管理、召回测试、清单过大提示(§7)。

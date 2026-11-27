# PostgreSQL + G6 + Jena 底座发布（2026-11-27）

## 1. 完整板块

owner 已批准选型与技术引入。PR [393](https://github.com/vxture/vxture-karda/pull/393) 已合并，精确主干 bd8800b580a16243bc434cb4580fbc226e15cd1b；清单见 [202](../70-workplan/202-graph-foundation-g6-jena-20261127.md)，架构见 [180](../30-design/180-knowledge-graph-technology-selection.md) 与170§73。

- G6 5.1.1 接管现有图谱页的画布、布局、相机、平行边与缩略导航；保留目录、证据和键盘操作。
- RDF 映射保留实体/关系/断言/证据稳定身份、业务方向、来源版本及锚点，生成标准 SHACL。
- Jena 6.3.0 / Java21 实际执行 SHACL/固定 ARQ 查询；正式安全读取窗口增加标准校验门禁。
- 每次独立 Java 进程只接收授权窗口，不开放 SPARQL、网络服务、原件正文或持久全库缓存。
- Java、原始依赖 JAR 和许可证纳入应用镜像；新增 Maven 完整 SBOM 审计与Java模块阶段验收。
- 无 DDL、87表保持；不清库、不改已有裁决或客户权限。迁移/回退方案见202§3。

## 2. 阶段门禁

PR CI [45960322551](https://github.com/vxture/vxture-karda/actions/runs/45960322551) 首轮成功：应用1175项、Java3项，零失败/跳过；扫描45960322540成功。Java完整28项运行依赖清单生成与OSV审计成功。

精确主干 CI [45960747578](https://github.com/vxture/vxture-karda/actions/runs/45960747578) 与扫描45960747620全部成功。版本标签v0.12.51固定上述主干；不移动旧标签。

## 3. 发布状态

部署 [45961078818](https://github.com/vxture/vxture-karda/actions/runs/45961078818) 经原 production 审核，于2026-11-27T07:57:31Z（北京时间15:57:31）成功。线上health/ready确认v0.12.51/bd8800b5/production，db/redis/storageConfig均ok。匿名语义和真实知识包接口均401；图谱页面与许可证路径307门禁。Node fetch知识包探针先遇网络超时，独立HTTPS连接复核返回401；不将超时算通过。无DDL，无需重复db-init。应用回退固定v0.12.50/ddf4a4b4。

## 4. 明确边界

无本地服务/浏览器/可见终端，未重复本地全量或性能专项。独立浏览器点击、客户业务效果与真实外部Agent未验。当前仍为授权窗口，未建设Fuseki/TDB2全库异步索引、规则推导正式发布或完整Ontos；不能称为完整图谱中心全部完成。

固定17项仍7完成/6进行中/4待门槛；I1暂停。平台代码/服务器变量/正式客户授权和owner70/output保持。

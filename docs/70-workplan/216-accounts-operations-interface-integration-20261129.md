# 正式产品运营接口授权接入

日期：2026-11-29。用户指示：检查更新后的三份飞书文档，先打通接口授权。仅修改 Karda。

## 契约依据

- [设计](https://vxturestudio.feishu.cn/wiki/HBBQwpTRSibuH3km3sOc0QkEnzb)：已阅读 v0.3，产品级多owner/member、逐次实时求值、非推送失效。
- [总目录](https://vxturestudio.feishu.cn/wiki/BMqTwyzRbilVphkYuotc7RE0nwd)：v0.4发布说明指向平台PR759/760、v0.33.19；正文旧版本标识仍存在。
- [API参考](https://vxturestudio.feishu.cn/wiki/H1SswJnHyitBhgk6egVcV0Rxngc)：已读 ProductDelegation、OPS08/09/10/11及schema；正文仍保留本地未上线历史说明。
- 固定平台提交14b8c4c50c2f539dfcb0718ef7c22d2612f72184（PR760，前序PR759），Accounts实装routers/product-operations.router.ts。平台部署46174400004已成功，v0.33.19。不修改平台。

## 本步范围与状态

- [x] 替换旧草案transport：POST /oidc/operations/access 与 /members，client_secret_basic先OAuth表单编码，subject_token仅服务端持有。
- [x] 服务端从独立员工RP会话取当前有效access token，检查精确aud、openid、sid/jti、operator、无租户/act/mode；令牌不回传前台或进入日志。
- [x] 固定产品UUID核对、十进制signed-bigint revision、null姓名、effective、完整同版本分页；冲突/故障拒绝。
- [x] 既有每次请求/后台任务前校验与提交后版本围栏接正式权威；Owner仍只有授权管理职责，不自动获得公共内容权限。
- [ ] 集中CI与Karda发布。
- [ ] 实际workforce客户端登记和Karda部署侧凭据/产品UUID配置核对。
- [ ] 真实员工登录 → 当前准入 → Owner名单 → 本地细分角色/撤权实操。

本步先接实时准入/名单，不代用户在平台授予owner/member、不创建客户端或改平台配置。人员平台写入和持久事件读取后续按实际需要接入；首版实时核权不依赖事件推送。运营模型/OCR/计量仍不在平台本批已上线范围。

## 配置与实际验证要求

Karda部署持有独立KARDA_OPS_CLIENT_ID、KARDA_OPS_CLIENT_SECRET，KARDA_OPS_PRODUCT_ID为平台登记的Karda产品UUID；KARDA_OPS_ENABLED=on仅在正式登记核对完成后启用。配置不能使用customer客户端或随意UUID，不输出密钥。

当前内置浏览器Opera跳到Accounts员工登录，需本人完成登录后只读核对现有Karda登记。没有真实员工会话和正确客户端配置时不能宣称授权打通；无凭据401与模拟transport不能替代实际授权验收。

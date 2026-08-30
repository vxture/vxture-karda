import { pageTitle } from "../../../../_i18n/server-locale";
import { assets } from "../../../../_i18n/messages/assets";
import { AssetClient } from "../asset-client";

// 一个库的设置，自己的一页。
//
// 它此前是详情页的第三个 tab，与「文档」「外部来源」并排——而那三个不在一个维度
// 上：前两个回答「里面有什么」，这一个回答「它怎么运转」（owner 2026-08-30）。
// 搬成子路由之后它有了自己的地址：可收藏、可从别处直达、浏览器的返回键管用，而
// 不再是一个刷新就丢的 tab 状态。
//
// 渲染的是**同一个** `AssetClient`，只是换一个视图。两页要的服务端数据是同一批，
// 拆成两个组件就会有两套加载和两套失败处理。
export async function generateMetadata() {
  return pageTitle(assets.settingsLabel);
}

export default function AssetSettingsPage() {
  return <AssetClient view="settings" />;
}

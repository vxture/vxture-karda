import { pageTitle } from "../../../_i18n/server-locale";
import { shell } from "../../../_i18n/messages/shell";
import { NewAssetClient } from "./new-client";

// 标题跟随用户语言(TD-014 已闭):pageTitle 读 cookie 里的服务端 locale。
export async function generateMetadata() {
  return pageTitle(shell.newAsset);
}

// Creating a library IS the classification step: a document is classified by
// which library it goes into, and each library carries its own sharing grade.
//
// 纯流程页(KD-223,150 §3.1):此前它还同时列库——与 /assets 重复,一份第二个会
// 漂的清单。列表是 /assets 的职责,这里只做一件事:问四个问题,建一个库,把人送
// 进去。
export default function NewAssetPage() {
  return <NewAssetClient />;
}

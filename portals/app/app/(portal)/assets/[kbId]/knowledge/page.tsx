import { pageTitle } from "../../../../_i18n/server-locale";
import { assets } from "../../../../_i18n/messages/assets";
import { KnowledgeClient } from "./knowledge-client";

// 知识确认台:卡尔达在这个库上抽出了什么,由属主处置(KD-222)。
//
// 自己的地址,与设置页同一条理由(KD-217):状态条的「抽取」段、首页的卡尔达数字
// 都要一个能直达的落点,而 tab 状态给不了。与设置页**不同**的是它不共用
// `AssetClient`——共用的前提是「两页要的服务端数据是同一批」,这一页要的是另一批
// (knowledge 端点),共用只会让两页各自多载对方的数据。
export async function generateMetadata() {
  return pageTitle(assets.knowledgeLabel);
}

export default function AssetKnowledgePage() {
  return <KnowledgeClient />;
}

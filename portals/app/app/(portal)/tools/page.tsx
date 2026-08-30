import { pageTitle } from "../../_i18n/server-locale";
import { shell } from "../../_i18n/messages/shell";
import { ToolsClient } from "./tools-client";

// 标题跟随用户语言(TD-014 已闭):pageTitle 读 cookie 里的服务端 locale。
export async function generateMetadata() {
  return pageTitle(shell.subTools);
}

// The self-describing tool surface, for an agent developer. Reads
// /api/tools/catalog, which projects the SAME manifest as
// /.well-known/vxture-tools - that one is tailnet-only and S2S-authenticated by
// design, so a browser cannot read it and this page is how a human sees the
// contract at all.
export default function ToolsPage() {
  return <ToolsClient />;
}

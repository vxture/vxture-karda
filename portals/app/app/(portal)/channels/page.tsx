import { pageTitle } from "../../_i18n/server-locale";
import { shell } from "../../_i18n/messages/shell";
import { ChannelsClient } from "./channels-client";

// 标题跟随用户语言(TD-014 已闭):pageTitle 读 cookie 里的服务端 locale。
export async function generateMetadata() {
  return pageTitle(shell.navChannels);
}

// The supply-channels domain (直供 S2S / Runos MCP), per 230-runos-channel.
// Data comes from GET /api/channels client-side, gated on the session; ops
// figures are the demo overlay (flagged demoOps) until the supply ledger lands.
export default function ChannelsPage() {
  return <ChannelsClient />;
}

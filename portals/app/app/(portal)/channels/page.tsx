import { BRAND } from "@karda/shared/brand";
import { ChannelsClient } from "./channels-client";

export const metadata = { title: `供给通道 - ${BRAND.displayName}` };

// The supply-channels domain (直供 S2S / Runos MCP), per 230-runos-channel.
// Data comes from GET /api/channels client-side, gated on the session; ops
// figures are the demo overlay (flagged demoOps) until the supply ledger lands.
export default function ChannelsPage() {
  return <ChannelsClient />;
}

import { BRAND } from "@karda/shared/brand";
import { ToolsClient } from "./tools-client";

export const metadata = { title: `工具面 - ${BRAND.displayName}` };

// The self-describing tool surface, for an agent developer. Reads
// /api/tools/catalog, which projects the SAME manifest as
// /.well-known/vxture-tools - that one is tailnet-only and S2S-authenticated by
// design, so a browser cannot read it and this page is how a human sees the
// contract at all.
export default function ToolsPage() {
  return <ToolsClient />;
}

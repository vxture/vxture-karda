import { EmptyState } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import { PageHead } from "../../_shell/PageHead";

export const metadata = { title: `供给通道 - ${BRAND.displayName}` };

// Placeholder: the supply-channels domain (直供 / Runos MCP) is designed
// (design canvas V2) and lands after the overview milestone. The page still
// opens with the unified PageHead so the portal chrome reads consistently.
export default function ChannelsPage() {
  return (
    <>
      <PageHead title="供给通道" description="直供与 Runos 两条供给通道" />
      <div className="flex items-center justify-center py-24">
        <EmptyState
          icon="plugs-connected"
          title="建设中"
          description="直供与 Runos 两条通道的运行状态与消费账本,随通道里程碑交付。"
        />
      </div>
    </>
  );
}

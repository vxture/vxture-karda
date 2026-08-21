import { EmptyState } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";

export const metadata = { title: `供给通道 - ${BRAND.displayName}` };

// Placeholder: the supply-channels domain (直供 / Runos MCP) is designed
// (design canvas V2) and lands after the overview milestone.
export default function ChannelsPage() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <EmptyState
        icon="plugs-connected"
        title="供给通道"
        description="直供与 Runos 两条通道的运行状态与消费账本,建设中。"
      />
    </div>
  );
}

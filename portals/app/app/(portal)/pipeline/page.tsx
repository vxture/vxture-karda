import { EmptyState } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";

export const metadata = { title: `加工管道 - ${BRAND.displayName}` };

// Placeholder: the steward-driven processing domain (理解/萃取/编织/验证/入藏)
// is designed (design canvas V2) and lands after the overview milestone.
export default function PipelinePage() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <EmptyState
        icon="workflow"
        title="加工管道"
        description="知识管家驱动的智能加工流水与待确认提案,建设中。"
      />
    </div>
  );
}

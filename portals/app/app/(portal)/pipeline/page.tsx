import { EmptyState } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import { PageHead } from "../../_shell/PageHead";

export const metadata = { title: `加工管道 - ${BRAND.displayName}` };

// Placeholder: the steward-driven processing domain (理解/萃取/编织/验证/入藏)
// has its detailed UI approved on the design canvas (任务与队列 / 任务详情 /
// 受控重建, 2026-08-24); implementation lands with the pipeline milestone.
export default function PipelinePage() {
  return (
    <>
      <PageHead title="加工管道" description="知识管家驱动的智能加工" />
      <div className="flex items-center justify-center py-24">
        <EmptyState
          icon="workflow"
          title="建设中"
          description="加工流水、任务队列与待确认提案,随管线里程碑交付。"
        />
      </div>
    </>
  );
}

import { EmptyState } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import { PageHead } from "../../_shell/PageHead";

export const metadata = { title: `验证评测 - ${BRAND.displayName}` };

// Placeholder: the verification & evaluation domain (评测集、召回质量、
// 回答准确性) is the fourth top-level menu entry; design follows.
export default function EvaluationPage() {
  return (
    <>
      <PageHead title="验证评测" description="验证、评测与质量基线" />
      <div className="flex items-center justify-center py-24">
        <EmptyState
          icon="list-checks"
          title="建设中"
          description="验证治理与检索/回答质量评测,随评测里程碑交付。"
        />
      </div>
    </>
  );
}

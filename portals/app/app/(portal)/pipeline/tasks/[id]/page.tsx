import { BRAND } from "@karda/shared/brand";
import { t } from "../../../../_i18n/catalog";
import { shell } from "../../../../_i18n/messages/shell";
import { TaskClient } from "./task-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.taskDetail, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// 加工管道 · 任务详情 (design canvas V2 third row). Demo overlay via
// GET /api/pipeline/tasks/:id until the 110-processing pipeline lands.
export default async function PipelineTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskClient id={id} />;
}

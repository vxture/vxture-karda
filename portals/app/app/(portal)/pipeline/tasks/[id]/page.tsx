import { BRAND } from "@karda/shared/brand";
import { TaskClient } from "./task-client";

export const metadata = { title: `任务详情 - ${BRAND.displayName}` };

// 加工管道 · 任务详情 (design canvas V2 third row). Demo overlay via
// GET /api/pipeline/tasks/:id until the 110-processing pipeline lands.
export default async function PipelineTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskClient id={id} />;
}

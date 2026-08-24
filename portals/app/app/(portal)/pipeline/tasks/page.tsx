import { BRAND } from "@karda/shared/brand";
import { TasksClient } from "./tasks-client";

export const metadata = { title: `任务与队列 - ${BRAND.displayName}` };

// 加工管道 · 任务与队列 (design canvas V2 third row). Demo overlay via
// GET /api/pipeline/tasks until the 110-processing pipeline lands.
export default function PipelineTasksPage() {
  return <TasksClient />;
}

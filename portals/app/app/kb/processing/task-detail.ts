import type { TaskDetail } from "../demo/pipeline-types";
import { STAGES, type TaskRow } from "./task-read";

// Never fill a missing production fact with the authored demonstration task.
export function taskDetail(row: TaskRow): TaskDetail {
  return {
    id: row.id, title: row.documentTitle,
    meta: [row.kbName, row.tier], badge: row.state, live: true,
    stages: STAGES.map((stage, i) => {
      const recorded = row.stages.find(s => s.stage === stage);
      return {
        kicker: `${String(i + 1).padStart(2, "0")} ${stage.toUpperCase()}`,
        label: stage,
        state: row.state === "done" || recorded?.outcome === "ok" || recorded?.outcome === "skipped" ? "done"
          : row.state === "running" && row.currentStage === stage ? "active" : "todo",
        timing: recorded?.endedAt ? `${Math.max(0, recorded.endedAt.getTime() - recorded.startedAt.getTime()) / 1000}s` : undefined,
        desc: row.currentStage === stage ? row.failureReason ?? "" : "",
      };
    }),
    config: [], configNote: "", lineageNote: "", cost: [],
    lineage: [["document_id", row.documentId], ["attempt", String(row.attempt)],
      ["queued_at", row.queuedAt.toISOString()], ["started_at", row.startedAt?.toISOString() ?? "-"],
      ["finished_at", row.finishedAt?.toISOString() ?? "-"]],
    demoOps: false,
  };
}

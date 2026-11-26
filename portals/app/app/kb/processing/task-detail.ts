import type { TaskDetail } from "../demo/pipeline-types";
import { STAGES, type TaskRow } from "./task-read";

// Never fill a missing production fact with the authored demonstration task.
export function taskDetail(row: TaskRow): TaskDetail {
  return {
    id: row.id, title: row.documentTitle,
    meta: [row.kbName, row.tier], badge: row.state, live: true,
    stages: (row.currentStage==="extract"?["extract"]:STAGES).map((stage, i) => {
      const recorded = row.stages.find(s => s.stage === stage);
      return {
        kicker: `${String(i + 1).padStart(2, "0")} ${stage.toUpperCase()}`,
        label: stage,
        state: row.state === "suspended" && row.currentStage === stage ? "suspended"
          : recorded?.outcome === "failed" || row.state === "failed" && row.currentStage === stage ? "failed"
          : recorded?.outcome === "ok" || recorded?.outcome === "skipped" ? "done"
          : row.state === "running" && row.currentStage === stage ? "active" : "todo",
        // A resumed task reuses immutable stage openings. Such intervals span
        // retries/parking and must not be presented as model execution time.
        timing: recorded?.endedAt && row.startedAt && recorded.startedAt >= row.startedAt
          && recorded.endedAt >= recorded.startedAt
          ? `${(recorded.endedAt.getTime() - recorded.startedAt.getTime()) / 1000}s` : undefined,
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

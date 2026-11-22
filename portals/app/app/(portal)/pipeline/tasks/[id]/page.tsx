import { pageTitle } from "../../../../_i18n/server-locale";
import { shell } from "../../../../_i18n/messages/shell";
import { TaskClient } from "./task-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export async function generateMetadata() {
  return pageTitle(shell.taskDetail);
}

// Task details resolve through the workspace-scoped production read model.
export default async function PipelineTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskClient id={id} />;
}

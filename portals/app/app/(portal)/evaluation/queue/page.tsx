import { Suspense } from "react";
import { pageTitle } from "../../../_i18n/server-locale";
import { shell } from "../../../_i18n/messages/shell";
import { QueueClient } from "./queue-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export async function generateMetadata() {
  return pageTitle(shell.subQueue);
}

// The re-verification workbench. `?kb=<id>` narrows it to one library, which is
// what the 低于覆盖基线 rows on 验证评测 link to.
//
// Suspense because the client reads that param with useSearchParams, which opts
// the route into client-side rendering and requires a boundary at build time.
export default function QueuePage() {
  return (
    <Suspense fallback={null}>
      <QueueClient />
    </Suspense>
  );
}

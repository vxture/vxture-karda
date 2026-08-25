import { Suspense } from "react";
import { BRAND } from "@karda/shared/brand";
import { QueueClient } from "./queue-client";

export const metadata = { title: `待复验队列 - ${BRAND.displayName}` };

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

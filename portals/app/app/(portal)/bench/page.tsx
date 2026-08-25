import { BRAND } from "@karda/shared/brand";
import { BenchClient } from "./bench-client";

export const metadata = { title: `检验台 - ${BRAND.displayName}` };

// 检验台: ask karda the way an agent does, and read what comes back. It was
// already listed in the portal header's launcher while living outside the
// portal shell - this closes that gap.
export default function BenchPage() {
  return <BenchClient />;
}

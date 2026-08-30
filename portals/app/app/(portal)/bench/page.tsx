import { pageTitle } from "../../_i18n/server-locale";
import { shell } from "../../_i18n/messages/shell";
import { BenchClient } from "./bench-client";

// 标题跟随用户语言(TD-014 已闭):pageTitle 读 cookie 里的服务端 locale。
export async function generateMetadata() {
  return pageTitle(shell.subBench);
}

// 检验台: ask karda the way an agent does, and read what comes back. It was
// already listed in the portal header's launcher while living outside the
// portal shell - this closes that gap.
export default function BenchPage() {
  return <BenchClient />;
}

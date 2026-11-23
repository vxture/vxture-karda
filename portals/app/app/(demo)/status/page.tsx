import { notFound } from "next/navigation";
import { pageTitle, serverLocale } from "../../_i18n/server-locale";
import { readStatus, statusAccess } from "../../lib/status-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const generateMetadata = () => pageTitle({ "zh-CN": "运行状态", "en-US": "Service status" });

export default async function StatusPage() {
  const access = await statusAccess();
  if (access === 404) notFound();
  const en = (await serverLocale()) === "en-US";
  const title = en ? "Karda service status" : "Karda 运行状态";
  if (access === 401 || access === 503) {
    return (
      <main style={{ padding: "var(--vx-space-xl)" }}>
        <h1>{title}</h1>
        {access === 401
          ? <p><a href="/gate?from=%2Fstatus">{en ? "Sign in to view status" : "登录后查看运行状态"}</a></p>
          : <p>{en ? "Sign-in is temporarily unavailable." : "暂时无法确认登录状态，请稍后重试。"}</p>}
      </main>
    );
  }
  const { status, updatedAt } = await readStatus();
  const labels = en
    ? { operational: "Operational", degraded: "Degraded", unavailable: "Unavailable" }
    : { operational: "正常", degraded: "降级", unavailable: "不可用" };
  return (
    <main style={{ padding: "var(--vx-space-xl)" }}>
      <h1>{title}</h1>
      <p>{labels[status]}</p>
      <p>{en ? "Last checked: " : "更新时间："}<time dateTime={updatedAt}>{updatedAt.slice(0, 19).replace("T", " ")} UTC</time></p>
    </main>
  );
}

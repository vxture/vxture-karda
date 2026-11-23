import { pageTitle, serverLocale } from "../../_i18n/server-locale";
import { subscribeUrl } from "../../entitlement/deeplink";

export const generateMetadata = () => pageTitle({ "zh-CN": "套餐与权益", "en-US": "Plans and entitlements" });

export default async function EntitlementInfoPage() {
  const en = (await serverLocale()) === "en-US";
  const pricing = subscribeUrl({ intent: "upgrade" }).replace("/zh-CN/", en ? "/en-US/" : "/zh-CN/");
  return (
    <main style={{ padding: "var(--vx-space-xl)" }}>
      <h1>{en ? "Karda plans and entitlements" : "Karda 套餐与权益"}</h1>
      <p>{en ? "See current plans, pricing, and quotas on the Karda pricing page." : "查看当前在售套餐、价格和配额，请前往 Karda 套餐页。"}</p>
      <p><a href={pricing}>{en ? "View plans and pricing" : "查看套餐与价格"}</a></p>
      <p>{en ? "Sign in to see your workspace’s subscription entitlements." : "查看工作空间当前的订阅权益，请先登录 Karda。"}</p>
      <p><a href="/gate">{en ? "Sign in to Karda" : "登录 Karda"}</a></p>
    </main>
  );
}

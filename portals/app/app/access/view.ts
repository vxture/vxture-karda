import { subscribeUrl } from "../entitlement/deeplink";
import type { AccessState } from "./types";

export type GatePhase = { kind: "verifying" } | { kind: "resolved"; state: AccessState } | { kind: "error" };
export interface GateView {
  state: string;
  title: string;
  hint: string;
  retry?: boolean;
  action?: { label: string; href: string; external?: boolean };
}

export function gateView(phase: GatePhase, destination: string, en = false): GateView {
  const t = (zh: string, english: string) => en ? english : zh;
  const security = t("\u4f7f\u7528\u5e73\u53f0\u8d26\u53f7\u5b89\u5168\u767b\u5f55", "Sign in securely with your platform account");
  if (phase.kind === "verifying") return { state: "connecting", title: t("\u6b63\u5728\u8fde\u63a5", "Connecting"), hint: security };
  if (phase.kind === "error") return { state: "access-unavailable", title: t("\u6682\u65f6\u65e0\u6cd5\u786e\u8ba4\u4f7f\u7528\u6743\u9650", "Unable to verify access"), hint: t("\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff0c\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u3002", "Try again later or contact your administrator."), retry: true };
  switch (phase.state.status) {
    case "anonymous": return { state: "signin", title: t("\u667a\u80fd\u4f53\u77e5\u8bc6\u5e73\u53f0", "Agent Knowledge Platform"), hint: security, action: { label: t("\u7ee7\u7eed\u767b\u5f55", "Continue to sign in"), href: `/auth/login?returnTo=${encodeURIComponent(destination)}` } };
    case "authenticated": {
      const { user, entitlement, gates } = phase.state;
      const renew = gates.cta === "renew" || gates.cta === "pay";
      const commercial = gates.cta !== "none" && (entitlement.status == null || ["expired", "cancelled", "overdue"].includes(entitlement.status));
      if (!commercial) return { state: "access-unavailable", title: t("\u6682\u65f6\u65e0\u6cd5\u4f7f\u7528", "Access unavailable"), hint: t("\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u6838\u67e5\u4ea7\u54c1\u72b6\u6001\u3002", "Contact your administrator to check product status."), retry: true };
      return { state: renew ? "expired" : "subscription", title: renew ? t("\u8ba2\u9605\u9700\u8981\u7eed\u8ba2", "Subscription needs renewal") : t("\u5c1a\u672a\u5f00\u901a", "Subscription required"), hint: user.canManage ? t("\u53ef\u524d\u5f80\u4ea7\u54c1\u8ba2\u9605\u9875\u9762\u5904\u7406\uff0c\u5b8c\u6210\u540e\u91cd\u65b0\u68c0\u67e5\u3002", "Visit product subscriptions, then check again.") : t("\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5904\u7406\uff0c\u5b8c\u6210\u540e\u91cd\u65b0\u68c0\u67e5\u3002", "Contact your administrator, then check again."), retry: true,
        ...(user.canManage ? { action: { label: renew ? t("\u524d\u5f80\u7eed\u8ba2", "Renew subscription") : t("\u524d\u5f80\u5f00\u901a", "Subscribe"), href: subscribeUrl({ intent: renew ? "renew" : "upgrade" }).replace("/zh-CN/", en ? "/en-US/" : "/zh-CN/"), external: true } } : {}) };
    }
    case "product-unassigned": return { state: "product-unassigned", title: t("\u5c1a\u672a\u83b7\u5f97\u4f7f\u7528\u6743\u9650", "Product access not assigned"), hint: t("\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5f00\u901a\u4ea7\u54c1\u4f7f\u7528\u6743\u9650\u3002", "Contact your administrator to assign product access."), retry: true };
    case "inactive-account": return { state: "inactive-account", title: t("\u8d26\u53f7\u6682\u4e0d\u53ef\u7528", "Account unavailable"), hint: t("\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u6062\u590d\u8d26\u53f7\u3002", "Contact your administrator to restore your account."), retry: true };
    case "no-workspace": return { state: "no-workspace", title: t("\u5c1a\u672a\u52a0\u5165\u5de5\u4f5c\u7a7a\u95f4", "No workspace selected"), hint: t("\u8bf7\u5728\u63a7\u5236\u53f0\u521b\u5efa\u3001\u52a0\u5165\u6216\u9009\u62e9\u5de5\u4f5c\u7a7a\u95f4\u3002", "Create, join or select a workspace in the console."), retry: true, action: { label: t("\u524d\u5f80\u63a7\u5236\u53f0", "Open console"), href: "https://console.vxture.com/", external: true } };
    case "unconfigured": return { state: "unavailable", title: t("\u6682\u65f6\u65e0\u6cd5\u8fde\u63a5", "Unable to connect"), hint: t("\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u68c0\u67e5\u767b\u5f55\u914d\u7f6e\u3002", "Contact your administrator to check sign-in configuration."), retry: true };
    case "open": return { state: "connecting", title: t("\u6b63\u5728\u8fde\u63a5", "Connecting"), hint: security };
  }
}

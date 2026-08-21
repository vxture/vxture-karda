import type { IconName } from "@vxture/design-system";

// The product's top-level functional domains (owner, 2026-08-21). They render
// as the header menu area, left-aligned after the brand - the four entries ARE
// the product's information architecture, so this list is the single source
// both the header links and the launcher panel read from.
export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", href: "/", label: "资产总览", icon: "squares-four", description: "知识资产的统计、运营与健康" },
  { key: "channels", href: "/channels", label: "供给通道", icon: "plugs-connected", description: "直供与 Runos 两条供给通道" },
  { key: "pipeline", href: "/pipeline", label: "加工管道", icon: "workflow", description: "知识管家驱动的智能加工" },
  { key: "evaluation", href: "/evaluation", label: "验证评测", icon: "list-checks", description: "验证、评测与质量基线" },
] as const;

/** Resolve the active nav entry from a pathname ("/" matches only exactly). */
export function activeNavKey(pathname: string): string | null {
  for (const item of NAV_ITEMS) {
    if (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) return item.key;
  }
  return null;
}

// Shared presentational primitives, DS-backed (KD-020): the local prop APIs are
// kept so pages don't change, but every primitive renders through
// @vxture/design-system - basic controls are L1 and belong to the DS
// (01-usage.md section 6).
//
// Moved out of the retired Console in batch 10. `styles.page` went with it: it
// set a 920px width, its own padding and its own text colour, which the portal
// shell already owns (30-design/130-portal-shell.md). The pages that used it
// were also rendering a <main> INSIDE the shell's <main>.
//
// STAGE-2 (tracked in the workplan): the `T` palette and the remaining `styles`
// objects are legacy from the pre-DS console. New code must NOT add design
// values to them - use DS components and vx-* utility classes; the remaining
// page-level inline layout styles migrate to DS layout/patterns page by page.
"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Badge as DsBadge,
  Banner,
  Button as DsButton,
  EmptyState,
  StatusBadge,
  type Tone as DsTone,
} from "@vxture/design-system";
import type { Tone } from "./format";

/** local tone vocabulary (format.ts) -> the DS six-step tone scale. */
const DS_TONE: Record<Tone, DsTone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
  info: "info",
  muted: "neutral",
};

// Legacy palette + layout styles (pre-DS). Kept ONLY for the not-yet-migrated
// page-level layout; do not add new design values here (stage-2 removes it).
export const T = {
  ink: "var(--vx-color-foreground, #1a1a1a)",
  sub: "var(--vx-color-muted-foreground, #5a5a5a)",
  line: "var(--vx-color-border, #e0e0e0)",
  bg: "var(--vx-color-background, #ffffff)",
  soft: "var(--vx-color-muted, #f6f6f7)",
  accent: "var(--vx-color-primary, #2b5cff)",
  danger: "var(--vx-color-destructive, #c0392b)",
} as const;

export const styles = {
  card: { border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 18px", margin: "0 0 14px", background: T.bg } as CSSProperties,
  h1: { fontSize: 24, margin: "0 0 4px" } as CSSProperties,
  h2: { fontSize: 16, margin: "0 0 10px" } as CSSProperties,
  sub: { color: T.sub, fontSize: 14 } as CSSProperties,
  mono: { fontFamily: "ui-monospace, monospace" } as CSSProperties,
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as CSSProperties,
  input: { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: T.bg, color: T.ink } as CSSProperties,
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <StatusBadge tone={DS_TONE[tone]}>{children}</StatusBadge>;
}

/** Neutral (tone-less) badge, e.g. the search score chip. */
export function PlainBadge({ children }: { children: ReactNode }) {
  return <DsBadge variant="outline">{children}</DsBadge>;
}

// `danger` was REMOVED rather than exempted (DS 9.0.0).
//
// It had zero call sites - a leftover from the retired Console. A blanket,
// reason-free exemption on a WRAPPER would let any future caller reach
// `variant="destructive"` through it without the contract, and without showing
// up in the product's exemption census. That is precisely the back door the
// DistributiveOmit fix closed on ActionButton. A destructive action in this
// product goes through DestructiveButton.
//
// (The exemption prop is deliberately not spelled in this comment: the census is
// a grep, and a census that counts its own documentation is broken.)
const BUTTON_VARIANT: Record<string, "default" | "outline" | "ghost"> = {
  // local "primary" was the solid brand button - DS "default" is that.
  primary: "default",
  default: "outline",
  ghost: "ghost",
};

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <DsButton type={type} onClick={onClick} disabled={disabled} variant={BUTTON_VARIANT[variant]}>
      {children}
    </DsButton>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div style={{ margin: "0 0 14px" }}>
      <Banner tone={DS_TONE[tone]} title={children} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <EmptyState title={children} />;
}

export function SignInGate({ href }: { href: string }) {
  return (
    <EmptyState
      title="登录后使用"
      description="登录已过期，或你还没有登录。"
      action={
        <DsButton asChild>
          <a href={href}>登录</a>
        </DsButton>
      }
    />
  );
}

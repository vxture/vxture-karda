// Shared presentational primitives for the Console. Inline React.CSSProperties,
// no CSS framework - matching the existing surfaces (the landing page and the
// status dashboard). Everything here is dumb/presentational; data and actions
// live in the page components.
"use client";

import type { CSSProperties, ReactNode } from "react";
import { toneGlyph, type Tone } from "./format";

export const T = {
  ink: "#1a1a1a",
  sub: "#5a5a5a",
  line: "#e0e0e0",
  bg: "#ffffff",
  soft: "#f6f6f7",
  accent: "#2b5cff",
  danger: "#c0392b",
} as const;

export const styles = {
  page: { fontFamily: "system-ui, sans-serif", color: T.ink, lineHeight: 1.5, maxWidth: 920, margin: "0 auto", padding: "1.5rem" } as CSSProperties,
  card: { border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 18px", margin: "0 0 14px", background: T.bg } as CSSProperties,
  h1: { fontSize: 24, margin: "0 0 4px" } as CSSProperties,
  h2: { fontSize: 16, margin: "0 0 10px" } as CSSProperties,
  sub: { color: T.sub, fontSize: 14 } as CSSProperties,
  mono: { fontFamily: "ui-monospace, monospace" } as CSSProperties,
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as CSSProperties,
  input: { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit" } as CSSProperties,
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const bg = { ok: "#e8f6ec", warn: "#fdf6e3", bad: "#fdecea", info: "#e9eefb", muted: "#f0f0f0" }[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, borderRadius: 999, padding: "2px 10px", fontSize: 12.5, whiteSpace: "nowrap" }}>
      <span aria-hidden>{toneGlyph(tone)}</span>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base: CSSProperties = {
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${T.line}`,
    background: T.bg,
    color: T.ink,
    opacity: disabled ? 0.55 : 1,
  };
  const skin: Record<string, CSSProperties> = {
    default: {},
    primary: { background: T.accent, borderColor: T.accent, color: "#fff" },
    danger: { background: T.bg, borderColor: T.danger, color: T.danger },
    ghost: { border: "1px solid transparent", background: "transparent" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...skin[variant] }}>
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  const bg = { ok: "#e8f6ec", warn: "#fdf6e3", bad: "#fdecea", info: "#e9eefb", muted: T.soft }[tone];
  return (
    <div style={{ background: bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, margin: "0 0 12px" }} role="status">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: T.sub, fontSize: 14, padding: "18px 0", textAlign: "center" }}>{children}</div>;
}

/** Sign-in gate shown when the API answers 401. */
export function SignInGate({ href }: { href: string }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>Sign in to continue</h2>
      <p style={styles.sub}>Your session is required to manage libraries in this workspace.</p>
      <p style={{ marginTop: 12 }}>
        <a href={href}>
          <Button variant="primary">Sign in</Button>
        </a>
      </p>
    </div>
  );
}

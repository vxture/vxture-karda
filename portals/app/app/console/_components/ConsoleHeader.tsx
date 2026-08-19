"use client";

import { useEffect, useState } from "react";
import { getSession, loginHref, type SessionUser } from "../_lib/api";
import { T } from "../_lib/ui";

// Console top bar: brand + who is signed in + active workspace. Reads the same
// /auth/session endpoint the rest of the app uses; anonymous renders a sign-in
// link rather than blocking (the pages themselves gate their data on 401).
export function ConsoleHeader({ brand }: { brand: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSession()
      .then((s) => setUser(s.authenticated ? (s.user ?? null) : null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <header
      style={{
        borderBottom: `1px solid ${T.line}`,
        background: T.bg,
        padding: "10px 1.5rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Brand lockup via the DS .vx-brand-* composition (usage standard s7:
          apps must not copy brand font/size/spacing baselines locally). The
          mark is the owner-provided logo; the app favicon is the App Router
          convention file app/favicon.ico, auto-served by Next. */}
      <a href="/console" className="vx-brand-lockup" style={{ textDecoration: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="vx-brand-mark" src="/brand/vxture-logo.png" alt="" />
        <span className="vx-brand-name">{brand}</span>
        <span className="vx-brand-separator" aria-hidden />
        <span className="vx-brand-local-name">Console</span>
      </a>
      <div style={{ fontSize: 13, color: T.sub, display: "flex", gap: 14, alignItems: "center" }}>
        {loaded && user ? (
          <>
            {user.activeWorkspace && (
              <span title="active workspace" style={{ fontFamily: "ui-monospace, monospace" }}>
                ws:{user.activeWorkspace.slice(0, 8)}
              </span>
            )}
            <span title={user.sub} style={{ fontFamily: "ui-monospace, monospace" }}>
              {user.sub.length > 16 ? `${user.sub.slice(0, 16)}...` : user.sub}
            </span>
            <a href="/auth/logout" style={{ color: T.accent }}>
              Sign out
            </a>
          </>
        ) : loaded ? (
          <a href={loginHref("/console")} style={{ color: T.accent }}>
            Sign in
          </a>
        ) : null}
      </div>
    </header>
  );
}

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
      <a href="/console" style={{ textDecoration: "none", color: T.ink, fontWeight: 600, fontSize: 15 }}>
        {brand} <span style={{ color: T.sub, fontWeight: 400 }}>Console</span>
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

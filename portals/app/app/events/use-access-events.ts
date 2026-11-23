"use client";
import { permits } from "../authz/policy";
import { useEffect, useState } from "react";
import { isThrough, type AccessState } from "../access/types";
import { parseAccessEvent } from "./protocol";

// Reconnect retries repair a transport, not a permission-polling schedule.
// Only a changed durable version/context causes an access request.
export function useAccessEvents() {
  const [context, setContext] = useState("initial");
  const [recovering, setRecovering] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [canRead,setCanRead]=useState(true);
  useEffect(() => {
    const lifetime = new AbortController();
    let connection: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let revision: string | null = null, scope: string | null = null;
    let checking = false, dirty = false, terminal = false;
    const leave = () => {
      if (terminal || lifetime.signal.aborted) return;
      terminal = true; setBlocked(true); connection?.abort();
      window.location.replace(`/gate?from=${encodeURIComponent(location.pathname + location.search)}`);
    };
    const check = async () => {
      dirty = true;
      if (checking) return;
      checking = true;
      try {
        while (dirty && !lifetime.signal.aborted && !terminal) {
          dirty = false;
          const response = await fetch("/api/access", { cache: "no-store", signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]) });
          if (!response.ok) throw new Error("access_unavailable");
          const state = await response.json() as AccessState;
          if (lifetime.signal.aborted || terminal) return;
          if (!isThrough(state)) { leave(); return; }
          setCanRead(state.status === "open" || state.status === "authenticated" && permits(state.user.productAccess,"data.read"));
          setContext(JSON.stringify([scope,revision]));
          setRecovering(false);
        }
      } catch { if (!lifetime.signal.aborted) { setRecovering(true); dirty = true; connection?.abort(); } }
      finally { checking = false; }
    };
    const connect = async (attempt = 0) => {
      if (lifetime.signal.aborted || terminal) return;
      connection = new AbortController();
      try {
        const response = await fetch("/api/events", { cache: "no-store", signal: connection.signal,
          headers: { Accept: "text/event-stream" } });
        if (response.status === 204) return;
        if ([401, 409].includes(response.status)) { leave(); return; }
        if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("events_unavailable");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 16384) throw new Error("event_buffer_limit");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (!frame.startsWith("data: ")) continue;
            const event = parseAccessEvent(frame.slice(6));
            attempt = 0;
            if (event.type === "revoked") { leave(); return; }
            const changed = revision !== event.revision || scope !== event.context;
            revision = event.revision; scope = event.context;
            if (changed || dirty) void check(); else setRecovering(false);
          }
        }
      } catch { if (!lifetime.signal.aborted && !terminal) setRecovering(true); }
      finally { connection?.abort(); }
      if (!lifetime.signal.aborted && !terminal) {
        retry = setTimeout(() => void connect(attempt + 1), Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500);
      }
    };
    void connect();
    return () => { lifetime.abort(); connection?.abort(); clearTimeout(retry); };
  }, []);
  return { context, recovering, blocked, canRead };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listKbs,
  searchKbs,
  askKbs,
  loginHref,
  ApiError,
  type Kb,
  type SearchResult,
  type AskResult,
} from "../_lib/api";
import { apiErrorMessage } from "../_lib/format";
import { styles, Badge, Button, Notice, Empty, SignInGate, T } from "../_lib/ui";

// The Console retrieval surface (recall test + search + ask; product definition
// 5.4 makes recall testing a Console staple). Scope defaults to everything the
// session user can see; picking libraries narrows it - the server enforces
// visibility either way, this page only chooses within it.
export default function SearchPage() {
  const [kbs, setKbs] = useState<Kb[] | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"search" | "ask">("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [ask, setAsk] = useState<AskResult | null>(null);
  const [askUnavailable, setAskUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      setKbs(await listKbs());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      setError(e instanceof ApiError ? apiErrorMessage(e.status, e.code) : "Failed to load libraries.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kbName = (id: string) => kbs?.find((k) => k.id === id)?.name ?? id;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || running) return;
    setRunning(true);
    setError(null);
    setSearch(null);
    setAsk(null);
    setAskUnavailable(false);
    const kb_ids = selected.size > 0 ? [...selected] : undefined;
    try {
      if (mode === "search") {
        setSearch(await searchKbs({ query: q, kb_ids }));
      } else {
        setAsk(await askKbs({ question: q, kb_ids }));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return setNeedsAuth(true);
      if (err instanceof ApiError && err.status === 501) {
        setAskUnavailable(true);
      } else {
        setError(err instanceof ApiError ? apiErrorMessage(err.status, err.code) : "The query failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  if (needsAuth) {
    return (
      <main style={styles.page}>
        <SignInGate href={loginHref("/console/search")} />
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>Search</h1>
      <p style={styles.sub}>
        Search or ask across the libraries you can see. Leave the library filter empty to cover everything visible.
      </p>

      {error && <Notice tone="bad">{error}</Notice>}

      <section style={styles.card}>
        <form onSubmit={onRun}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Button type="button" variant={mode === "search" ? "primary" : "default"} onClick={() => setMode("search")}>
              Search
            </Button>
            <Button type="button" variant={mode === "ask" ? "primary" : "default"} onClick={() => setMode("ask")}>
              Ask
            </Button>
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              style={styles.input}
              placeholder={mode === "search" ? "Search query" : "Ask a question"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={mode === "search" ? "Search query" : "Question"}
            />
          </div>
          {kbs && kbs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {kbs.map((kb) => (
                <button
                  key={kb.id}
                  type="button"
                  onClick={() => toggle(kb.id)}
                  style={{
                    border: `1px solid ${selected.has(kb.id) ? T.accent : "#d0d3da"}`,
                    background: selected.has(kb.id) ? "#eef2ff" : "transparent",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {kb.name}
                </button>
              ))}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={!query.trim() || running}>
            {running ? "Running..." : mode === "search" ? "Run search" : "Ask"}
          </Button>
        </form>
      </section>

      {askUnavailable && (
        <Notice tone="info">Answering is not configured yet (the Atlas generation backend is not wired on this host).</Notice>
      )}

      {search && (
        <section>
          <div style={{ ...styles.sub, marginBottom: 8 }}>
            {search.items.length} result{search.items.length === 1 ? "" : "s"} across {search.scopeKbIds.length}{" "}
            librar{search.scopeKbIds.length === 1 ? "y" : "ies"}
            {search.degraded && " - rerank unavailable, keyword/vector order"}
            {search.partial && " - partial (a namespace failed)"}
          </div>
          {search.items.length === 0 ? (
            <Empty>No matches. Content only becomes searchable once it is indexed.</Empty>
          ) : (
            search.items.map((item, i) => (
              <div key={item.id} style={styles.card}>
                <div style={styles.rowBetween}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {i + 1}. {kbName(item.kbId)}
                  </div>
                  <Badge tone="info">{item.score.toFixed(4)}</Badge>
                </div>
                <div style={{ ...styles.sub, marginTop: 6, whiteSpace: "pre-wrap" }}>{item.snippet}</div>
              </div>
            ))
          )}
        </section>
      )}

      {ask && (
        <section>
          {ask.noContext ? (
            <Empty>No grounding found - nothing was generated. Index content or widen the library filter.</Empty>
          ) : (
            <>
              <div style={styles.card}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Answer</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{ask.answer}</div>
                {ask.degraded && <div style={{ ...styles.sub, marginTop: 8 }}>rerank unavailable - grounded on keyword/vector order</div>}
              </div>
              {ask.citations.map((c, i) => (
                <div key={c.id} style={styles.card}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    [{i + 1}] {kbName(c.kbId)}
                  </div>
                  <div style={{ ...styles.sub, marginTop: 6, whiteSpace: "pre-wrap" }}>{c.snippet}</div>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      <p style={{ ...styles.sub, marginTop: 8 }}>
        <a href="/console" style={{ color: T.accent }}>
          Back to libraries
        </a>
      </p>
    </main>
  );
}

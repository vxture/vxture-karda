"use client";

import { useCallback, useEffect, useState } from "react";
import { listKbs, createKb, loginHref, ApiError, type Kb } from "./_lib/api";
import { sharingMeta, apiErrorMessage } from "./_lib/format";
import { styles, Badge, Button, Notice, Empty, SignInGate, T } from "./_lib/ui";

// Libraries index: the workspace's libraries with their sharing grade, and a
// create form. "Grade" is the publish state (private / workspace / organization);
// a document is classified by which library it is uploaded into, and each
// library carries its own sharing - so creating the right library IS the
// classification step (track 10: upload -> classify into graded libraries).
export default function ConsolePage() {
  const [kbs, setKbs] = useState<Kb[] | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createKb({ name: trimmed, description: description.trim() || undefined });
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return setNeedsAuth(true);
      setError(err instanceof ApiError ? apiErrorMessage(err.status, err.code) : "Failed to create the library.");
    } finally {
      setCreating(false);
    }
  }

  if (needsAuth) {
    return (
      <main style={styles.page}>
        <SignInGate href={loginHref("/console")} />
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>Libraries</h1>
      <p style={styles.sub}>Knowledge libraries in your active workspace. Upload documents into a library, then set who it is shared with.</p>

      {error && <Notice tone="bad">{error}</Notice>}

      <section style={styles.card}>
        <h2 style={styles.h2}>New library</h2>
        <form onSubmit={onCreate}>
          <div style={{ marginBottom: 10 }}>
            <input
              style={styles.input}
              placeholder="Library name"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              aria-label="Library name"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              style={styles.input}
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Library description"
            />
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim() || creating}>
            {creating ? "Creating..." : "Create library"}
          </Button>
          <span style={{ ...styles.sub, marginLeft: 12 }}>New libraries start Private - you can share them after.</span>
        </form>
      </section>

      <section>
        {kbs === null ? (
          <Empty>Loading libraries...</Empty>
        ) : kbs.length === 0 ? (
          <Empty>No libraries yet. Create your first one above.</Empty>
        ) : (
          kbs.map((kb) => {
            const share = sharingMeta(kb.publishState);
            return (
              <a key={kb.id} href={`/console/${kb.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ ...styles.card, cursor: "pointer" }}>
                  <div style={styles.rowBetween}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{kb.name}</div>
                      {kb.description && <div style={{ ...styles.sub, marginTop: 2 }}>{kb.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {kb.governanceEnabled && <Badge tone="info">Governed</Badge>}
                      <Badge tone={share.tone}>{share.label}</Badge>
                    </div>
                  </div>
                </div>
              </a>
            );
          })
        )}
      </section>

      <p style={{ ...styles.sub, marginTop: 8 }}>
        <a href="/status" style={{ color: T.accent }}>
          Integration status
        </a>
      </p>
    </main>
  );
}

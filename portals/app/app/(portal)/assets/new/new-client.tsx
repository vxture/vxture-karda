"use client";

import { useCallback, useEffect, useState } from "react";
import { listKbs, createKb, loginHref, ApiError, type Kb } from "../../../_lib/api";

import { styles, Badge, Button, Notice, Empty, SignInGate, T } from "../../../_lib/ui";
import { useFormat, type Failure } from "../../../_i18n/useFormat";

import { useMessages } from "../../../_i18n/useMessages";
import { assets } from "../../../_i18n/messages/assets";

// Libraries index: the workspace's libraries with their sharing grade, and a
// create form. "Grade" is the publish state (private / workspace / organization);
// a document is classified by which library it is uploaded into, and each
// library carries its own sharing - so creating the right library IS the
// classification step (track 10: upload -> classify into graded libraries).
export function NewAssetClient() {
  const f = useFormat();
  const m = useMessages(assets);
  const [kbs, setKbs] = useState<Kb[] | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setKbs(await listKbs());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      setError({ cause: e, fb: assets.errLoadList });
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
      setError({ cause: err, fb: assets.errCreate });
    } finally {
      setCreating(false);
    }
  }

  if (needsAuth) {
    return (
      <>
        <SignInGate href={loginHref("/assets/new")} />
      </>
    );
  }

  return (
    <>
      <h1 style={styles.h1}>{m.indexTitle}</h1>
      <p style={styles.sub}>
        {m.indexLead}{" "}
        <a href="/bench" style={{ color: T.accent }}>
          {m.indexBenchLink}
        </a>{" "}
        {m.indexBenchTail}
      </p>

      {error && <Notice tone="bad">{f.failure(error)}</Notice>}

      <section style={styles.card}>
        <h2 style={styles.h2}>{m.createTitle}</h2>
        <form onSubmit={onCreate}>
          <div style={{ marginBottom: 10 }}>
            <input
              style={styles.input}
              placeholder={m.createNameLabel}
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              aria-label={m.createNameLabel}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              style={styles.input}
              placeholder={m.createDescPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label={m.createDescLabel}
            />
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim() || creating}>
            {creating ? m.createPending : m.createTitle}
          </Button>
          <span style={{ ...styles.sub, marginLeft: 12 }}>{m.createHint}</span>
        </form>
      </section>

      <section>
        {kbs === null ? (
          <Empty>{m.indexLoading}</Empty>
        ) : kbs.length === 0 ? (
          <Empty>{m.indexEmpty}</Empty>
        ) : (
          kbs.map((kb) => {
            const share = f.sharing(kb.publishState);
            return (
              <a key={kb.id} href={`/assets/${kb.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ ...styles.card, cursor: "pointer" }}>
                  <div style={styles.rowBetween}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{kb.name}</div>
                      {kb.description && <div style={{ ...styles.sub, marginTop: 2 }}>{kb.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {kb.governanceEnabled && <Badge tone="info">{m.governedBadge}</Badge>}
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
          {m.integrationStatus}
        </a>
      </p>
    </>
  );
}

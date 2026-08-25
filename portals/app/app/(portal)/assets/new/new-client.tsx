"use client";

import { useCallback, useEffect, useState } from "react";
import { listKbs, createKb, loginHref, ApiError, type Kb } from "../../../_lib/api";
import { sharingMeta, apiErrorMessage } from "../../../_lib/format";
import { styles, Badge, Button, Notice, Empty, SignInGate, T } from "../../../_lib/ui";

// Libraries index: the workspace's libraries with their sharing grade, and a
// create form. "Grade" is the publish state (private / workspace / organization);
// a document is classified by which library it is uploaded into, and each
// library carries its own sharing - so creating the right library IS the
// classification step (track 10: upload -> classify into graded libraries).
export function NewAssetClient() {
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
      setError(e instanceof ApiError ? apiErrorMessage(e.status, e.code) : "资产列表加载失败。");
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
      setError(err instanceof ApiError ? apiErrorMessage(err.status, err.code) : "创建失败。");
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
      <h1 style={styles.h1}>知识资产</h1>
      <p style={styles.sub}>
        当前工作区的知识资产。把文档传进某个资产，再决定它共享给谁。{" "}
        <a href="/bench" style={{ color: T.accent }}>
          检验台
        </a>{" "}
        可跨你能看到的全部资产试问。
      </p>

      {error && <Notice tone="bad">{error}</Notice>}

      <section style={styles.card}>
        <h2 style={styles.h2}>新建资产</h2>
        <form onSubmit={onCreate}>
          <div style={{ marginBottom: 10 }}>
            <input
              style={styles.input}
              placeholder="资产名称"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              aria-label="资产名称"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              style={styles.input}
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="资产描述"
            />
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim() || creating}>
            {creating ? "创建中…" : "新建资产"}
          </Button>
          <span style={{ ...styles.sub, marginLeft: 12 }}>新建的资产默认私有，创建后再决定共享范围。</span>
        </form>
      </section>

      <section>
        {kbs === null ? (
          <Empty>Loading libraries...</Empty>
        ) : kbs.length === 0 ? (
          <Empty>还没有资产。用上面的表单建第一个。</Empty>
        ) : (
          kbs.map((kb) => {
            const share = sharingMeta(kb.publishState);
            return (
              <a key={kb.id} href={`/assets/${kb.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ ...styles.card, cursor: "pointer" }}>
                  <div style={styles.rowBetween}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{kb.name}</div>
                      {kb.description && <div style={{ ...styles.sub, marginTop: 2 }}>{kb.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {kb.governanceEnabled && <Badge tone="info">已开启治理</Badge>}
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
          集成状态
        </a>
      </p>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getKb,
  listDocuments,
  uploadDocument,
  deleteDocument,
  setSharing,
  setGovernance,
  setVerifierConfig,
  verifyDocument,
  loginHref,
  ApiError,
  type Kb,
  type Doc,
} from "../_lib/api";
import {
  sharingMeta,
  contentStateMeta,
  verificationMeta,
  formatInterval,
  processingHint,
  formatBytes,
  formatWhen,
  apiErrorMessage,
  PUBLISH_ORDER,
  type PublishState,
} from "../_lib/format";
import { styles, Badge, Button, Notice, Empty, SignInGate, T } from "../_lib/ui";

// Library detail: the documents in one library, an upload control, the sharing
// grade (publish ladder), and the governance switch. All authorization is
// server-side - the sharing buttons post the target and surface whatever the
// server allows (an owner may open to the workspace; only an admin opens org-
// wide), so a refusal shows its reason rather than being hidden.
export default function LibraryPage() {
  const params = useParams<{ kbId: string }>();
  const kbId = params.kbId;

  const [kb, setKb] = useState<Kb | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifierInput, setVerifierInput] = useState("");
  const [intervalInput, setIntervalInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Mirror the saved governance config into the editable inputs whenever the
  // library (re)loads, so the fields always show the current server state.
  useEffect(() => {
    if (!kb) return;
    setVerifierInput(kb.defaultVerifier ?? "");
    setIntervalInput(kb.defaultVerifyIntervalDays != null ? String(kb.defaultVerifyIntervalDays) : "");
  }, [kb]);

  const guard = useCallback((e: unknown, fallback: string): void => {
    if (e instanceof ApiError && e.status === 401) {
      setNeedsAuth(true);
      return;
    }
    setError(e instanceof ApiError ? apiErrorMessage(e.status, e.code) : fallback);
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await listDocuments(kbId));
    } catch (e) {
      guard(e, "Failed to load documents.");
    }
  }, [kbId, guard]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      setKb(await getKb(kbId));
    } catch (e) {
      guard(e, "Failed to load the library.");
      return;
    }
    await loadDocs();
  }, [kbId, guard, loadDocs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await uploadDocument(kbId, file);
      setNotice(`Uploaded "${file.name}".`);
      await loadDocs();
    } catch (err) {
      guard(err, "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(doc: Doc) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(kbId, doc.id);
      await loadDocs();
    } catch (err) {
      guard(err, "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onShare(target: PublishState) {
    if (busy || !kb || kb.publishState === target) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setKb(await setSharing(kbId, target));
      setNotice(`Sharing set to ${sharingMeta(target).label}.`);
    } catch (err) {
      guard(err, "Could not change sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleGovernance() {
    if (busy || !kb) return;
    setBusy(true);
    setError(null);
    try {
      setKb(await setGovernance(kbId, !kb.governanceEnabled));
    } catch (err) {
      guard(err, "Could not change governance.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveVerifierConfig() {
    if (busy || !kb) return;
    const raw = intervalInput.trim();
    const days = raw === "" ? null : Number(raw);
    if (days !== null && (!Number.isInteger(days) || days <= 0)) {
      setError("Interval must be a positive whole number of days, or blank for verify-once.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setKb(await setVerifierConfig(kbId, { defaultVerifier: verifierInput.trim() || null, defaultVerifyIntervalDays: days }));
      setNotice("Governance settings saved.");
    } catch (err) {
      guard(err, "Could not save governance settings.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(doc: Doc) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await verifyDocument(kbId, doc.id);
      setNotice(`Verified "${doc.title}".`);
      await loadDocs();
    } catch (err) {
      guard(err, "Could not verify the document.");
    } finally {
      setBusy(false);
    }
  }

  if (needsAuth) {
    return (
      <main style={styles.page}>
        <SignInGate href={loginHref(`/console/${kbId}`)} />
      </main>
    );
  }

  const share = kb ? sharingMeta(kb.publishState) : null;

  return (
    <main style={styles.page}>
      <p style={{ ...styles.sub, margin: "0 0 8px" }}>
        <a href="/console" style={{ color: T.accent }}>
          &larr; Libraries
        </a>
      </p>

      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      {kb === null ? (
        <Empty>Loading library...</Empty>
      ) : (
        <>
          <div style={{ ...styles.rowBetween, marginBottom: 14 }}>
            <div>
              <h1 style={styles.h1}>{kb.name}</h1>
              {kb.description && <p style={styles.sub}>{kb.description}</p>}
            </div>
            {share && <Badge tone={share.tone}>{share.label}</Badge>}
          </div>

          {/* Sharing (the publish ladder) */}
          <section style={styles.card}>
            <h2 style={styles.h2}>Sharing</h2>
            <p style={styles.sub}>{share?.help}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {PUBLISH_ORDER.map((state) => {
                const meta = sharingMeta(state);
                const current = kb.publishState === state;
                return (
                  <Button key={state} variant={current ? "primary" : "default"} disabled={busy || current} onClick={() => onShare(state)}>
                    {meta.label}
                    {current ? " (current)" : ""}
                  </Button>
                );
              })}
            </div>
            <p style={{ ...styles.sub, marginTop: 10 }}>
              You can publish your own library to the workspace; opening it organization-wide is an admin action.
            </p>
          </section>

          {/* Governance */}
          <section style={styles.card}>
            <div style={styles.rowBetween}>
              <div>
                <h2 style={{ ...styles.h2, marginBottom: 2 }}>Governance</h2>
                <p style={styles.sub}>
                  {kb.governanceEnabled
                    ? `Verification tracking is on. Re-verify ${formatInterval(kb.defaultVerifyIntervalDays)}.`
                    : "Off - content stays untracked (the default)."}
                </p>
              </div>
              <Button onClick={onToggleGovernance} disabled={busy}>
                {kb.governanceEnabled ? "Turn off" : "Turn on"}
              </Button>
            </div>

            {kb.governanceEnabled && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label style={{ flex: "1 1 220px", ...styles.sub }}>
                    Default verifier (user id)
                    <input
                      style={{ ...styles.input, marginTop: 4 }}
                      placeholder="usr_... (leave blank for admins only)"
                      value={verifierInput}
                      onChange={(e) => setVerifierInput(e.target.value)}
                      aria-label="Default verifier"
                    />
                  </label>
                  <label style={{ flex: "0 1 160px", ...styles.sub }}>
                    Re-verify interval (days)
                    <input
                      style={{ ...styles.input, marginTop: 4 }}
                      placeholder="blank = once"
                      inputMode="numeric"
                      value={intervalInput}
                      onChange={(e) => setIntervalInput(e.target.value)}
                      aria-label="Re-verify interval in days"
                    />
                  </label>
                  <Button onClick={onSaveVerifierConfig} disabled={busy}>
                    Save
                  </Button>
                </div>
                <p style={{ ...styles.sub, marginTop: 8 }}>
                  The assigned verifier (or an admin) may verify documents. A verified document turns stale once its
                  interval lapses, dropping out of the default search tier until re-verified.
                </p>
              </div>
            )}
          </section>

          {/* Upload */}
          <section style={styles.card}>
            <h2 style={styles.h2}>Add a document</h2>
            <input ref={fileRef} type="file" onChange={onUpload} disabled={busy} aria-label="Upload a document" />
            <p style={{ ...styles.sub, marginTop: 8 }}>
              The file is stored and queued for processing. Indexing is paused until the embedding service is available.
            </p>
          </section>

          {/* Documents */}
          <section style={styles.card}>
            <h2 style={styles.h2}>Documents{docs ? ` (${docs.length})` : ""}</h2>
            {docs === null ? (
              <Empty>Loading documents...</Empty>
            ) : docs.length === 0 ? (
              <Empty>No documents yet. Add one above.</Empty>
            ) : (
              docs.map((doc) => {
                const st = contentStateMeta(doc.contentState);
                const hint = processingHint(doc.contentState);
                const gov = kb.governanceEnabled;
                const vr = verificationMeta(doc.verificationState);
                return (
                  <div key={doc.id} style={{ borderTop: `1px solid ${T.line}`, padding: "10px 0" }}>
                    <div style={styles.rowBetween}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                        <div style={{ ...styles.sub, fontSize: 12.5 }}>
                          {formatWhen(doc.createdAt)} &middot; {formatBytes(doc.sizeBytes)} &middot; {doc.source}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {gov && <Badge tone={vr.tone}>{vr.label}</Badge>}
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {gov && (
                          <Button onClick={() => onVerify(doc)} disabled={busy}>
                            {doc.verificationState === "verified" ? "Re-verify" : "Verify"}
                          </Button>
                        )}
                        <Button variant="danger" onClick={() => onDelete(doc)} disabled={busy}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    {gov && doc.verificationState === "verified" && doc.verifiedAt && (
                      <div style={{ ...styles.sub, fontSize: 12.5, marginTop: 6 }}>
                        Verified {formatWhen(doc.verifiedAt)}
                        {doc.verifier ? ` by ${doc.verifier}` : ""}
                        {doc.expiresAt ? ` · expires ${formatWhen(doc.expiresAt)}` : ""}
                      </div>
                    )}
                    {doc.contentState === "failed" && doc.failureReason && (
                      <div style={{ ...styles.sub, color: T.danger, marginTop: 6 }}>{doc.failureReason}</div>
                    )}
                    {hint && <div style={{ ...styles.sub, marginTop: 6 }}>{hint}</div>}
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </main>
  );
}

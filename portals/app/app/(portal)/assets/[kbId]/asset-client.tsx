"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Banner, Button, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@vxture/design-system";
import {
  getKb,
  listDocuments,
  listFolders,
  listMetadataFields,
  listProcessingTemplates,
  listBindings,
  listConnectors,
  createBinding,
  bindingAction,
  uploadDocument,
  deleteDocument,
  reprocessDocument,
  setSharing,
  setGovernance,
  setProcessingTemplate,
  setVerifierConfig,
  verifyDocument,
  createFolder,
  renameFolder,
  deleteFolder,
  putMetadataFields,
  loginHref,
  ApiError,
  type Kb,
  type Doc,
  type Folder,
  type MetadataBudget,
  type MetadataField,
  type ProcessingTemplateOption,
  type Binding,
  type ConnectorInfo,
} from "../../../_lib/api";
import { type PublishState } from "../../../_lib/format";
import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { DocumentPanel } from "./DocumentPanel";
import { SettingsPanel } from "./SettingsPanel";
import { BindingPanel } from "./BindingPanel";
import { useFormat, type Failure } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import type { Message } from "../../../_i18n/catalog";
import { assets } from "../../../_i18n/messages/assets";

// One library, two tabs: what is IN it and how it BEHAVES. This page owns all
// server state and every mutation; the two panels are presentational and take
// handlers, so there is exactly one place that knows how a failure is reported
// and when a reload is needed.
//
// Batch 10 rebuilt this from the ported Console page. What it gained is the
// whole acceptance criterion: an owner sets the library's templates and policy,
// uploads a document, READS it in place, sees it fail with a reason, fixes the
// cause, re-runs it, verifies it and publishes - without leaving the shell.
//
// Authorization stays server-side. Controls the caller may not be allowed to use
// are still shown, because a refusal that states its reason is more useful than
// a control that silently is not there.
export function AssetClient() {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const params = useParams<{ kbId: string }>();
  const kbId = params.kbId;

  const [kb, setKb] = useState<Kb | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [templates, setTemplates] = useState<ProcessingTemplateOption[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [budget, setBudget] = useState<MetadataBudget | null>(null);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const [connectors, setConnectors] = useState<(ConnectorInfo & { code: string; meetsDeleteInvariant: boolean })[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const guard = useCallback((e: unknown, fallback: Message): void => {
    if (e instanceof ApiError && e.status === 401) {
      setNeedsAuth(true);
      return;
    }
    setError({ cause: e, fb: fallback });
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await listDocuments(kbId));
    } catch (e) {
      guard(e, assets.errLoadDocs);
    }
  }, [kbId, guard]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      setKb(await getKb(kbId));
    } catch (e) {
      guard(e, assets.errLoadKb);
      return;
    }
    await loadDocs();
    // The settings sources load together but must not take the page down with
    // them: a library is still usable if its template catalogue is unreachable,
    // so these failures are reported, not fatal.
    await Promise.all([
      listFolders(kbId).then(setFolders, (e) => guard(e, assets.errLoadFolders)),
      listProcessingTemplates().then(setTemplates, (e) => guard(e, assets.errLoadTemplates)),
      listMetadataFields(kbId).then(
        (r) => {
          setFields(r.fields);
          setBudget(r.budget);
        },
        (e) => guard(e, assets.errLoadFields),
      ),
      listBindings(kbId).then(setBindings, (e) => guard(e, assets.errLoadBindings)),
      listConnectors().then(setConnectors, (e) => guard(e, assets.errLoadConnectors)),
    ]);
  }, [kbId, guard, loadDocs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** Every mutation goes through here: one busy flag, one place that clears the
   *  old banners before acting, and one place that reports a failure. */
  const run = useCallback(
    async (fallback: Message, fn: () => Promise<string | null | void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const message = await fn();
        if (typeof message === "string") setNotice(message);
      } catch (e) {
        guard(e, fallback);
      } finally {
        setBusy(false);
      }
    },
    [busy, guard],
  );

  if (needsAuth) return <SignInGate href={loginHref(`/assets/${kbId}`)} />;

  const failedCount = (docs ?? []).filter((d) => d.contentState === "failed").length;

  return (
    <>
      <PageHead
        title={kb?.name ?? c.loading}
        description={kb?.description ?? undefined}
        meta={
          docs
            ? `${m.metaDocs(docs.length)}${failedCount > 0 ? ` · ${m.metaFailed(failedCount)}` : ""}${
                kb ? ` · ${f.sharing(kb.publishState).label}` : ""
              }`
            : undefined
        }
        actions={
          <Button variant="outline" asChild>
            {/* `/assets`,不是 `/`。KD-214 之前两者是同一页,迁路由时这一行没跟着改,
                于是「返回知识资产」会把人送到首页——按 §3.2,返回要回到这个对象
                **所属的那一层**,而不是任何一个上级。 */}
            <Link href="/assets">{m.backToAssets}</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}

      {kb === null ? (
        <EmptyState title={m.kbLoading} />
      ) : (
        <Tabs defaultValue="documents" className="flex flex-col gap-md">
          <TabsList>
            <TabsTrigger value="documents">{m.tabDocuments}{docs ? ` (${docs.length})` : ""}</TabsTrigger>
            <TabsTrigger value="bindings">
              {m.tabBindings}{bindings ? ` (${bindings.filter((b) => b.state !== "revoked").length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="settings">{m.tabSettings}</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <DocumentPanel
              kb={kb}
              docs={docs}
              folders={folders}
              busy={busy}
              onUpload={(file, folderId) =>
                run(assets.errUpload, async () => {
                  await uploadDocument(kbId, file, undefined, folderId);
                  await loadDocs();
                  return m.okUpload(file.name);
                })
              }
              onVerify={(doc) =>
                run(assets.errVerifyDoc, async () => {
                  await verifyDocument(kbId, doc.id);
                  await loadDocs();
                  return m.okVerifyDoc(doc.title);
                })
              }
              onRetry={(doc) =>
                run(assets.errReprocess, async () => {
                  await reprocessDocument(kbId, doc.id);
                  await loadDocs();
                  // Deliberately not "已完成": reprocess puts the document back
                  // in the queue, and claiming it succeeded would be a lie the
                  // user only discovers when it fails again.
                  return m.okReprocess(doc.title);
                })
              }
              onDelete={(doc) =>
                run(common.deleteFailed, async () => {
                  await deleteDocument(kbId, doc.id);
                  await loadDocs();
                })
              }
            />
          </TabsContent>

          <TabsContent value="bindings">
            <BindingPanel
              kb={kb}
              bindings={bindings}
              connectors={connectors}
              busy={busy}
              onCreate={(connectorCode, externalSourceId) =>
                run(assets.errBind, async () => {
                  const r = await createBinding(kbId, connectorCode, externalSourceId);
                  setBindings(await listBindings(kbId));
                  return m.okBind(r.connector?.name ?? connectorCode, externalSourceId);
                })
              }
              onAction={(binding, action) =>
                run(assets.errBindingAction, async () => {
                  const r = await bindingAction(kbId, binding.id, action);
                  setBindings(await listBindings(kbId));
                  if (action === "revoke") {
                    // Report what the cascade ACTUALLY did, not what the preview
                    // predicted - if they ever diverge, the owner should see the
                    // real number.
                    await loadDocs();
                    return m.okRevoke(binding.externalSourceId, r.cascade?.tombstoned ?? 0);
                  }
                  return action === "pause" ? m.okPause : m.okResume;
                })
              }
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel
              kb={kb}
              folders={folders}
              templates={templates}
              fields={fields}
              budget={budget}
              busy={busy}
              onShare={(target) =>
                run(assets.errShare, async () => {
                  if (kb.publishState === target) return;
                  setKb(await setSharing(kbId, target));
                  return m.okShare(f.sharing(target).label);
                })
              }
              onTemplate={(templateId) =>
                run(assets.errTemplate, async () => {
                  setKb(await setProcessingTemplate(kbId, templateId));
                  return m.okTemplate;
                })
              }
              onGovernance={(enabled) =>
                run(assets.errGovernanceToggle, async () => {
                  setKb(await setGovernance(kbId, enabled));
                })
              }
              onVerifierConfig={(verifier, intervalDays) =>
                run(assets.errGovernanceSave, async () => {
                  setKb(await setVerifierConfig(kbId, { defaultVerifier: verifier, defaultVerifyIntervalDays: intervalDays }));
                  return m.okGovernanceSave;
                })
              }
              onFields={(next) =>
                run(assets.errFieldsSave, async () => {
                  const r = await putMetadataFields(kbId, next);
                  setFields(r.fields);
                  setBudget(r.budget);
                  return m.okFieldsSave;
                })
              }
              onCreateFolder={(name) =>
                run(assets.errFolderCreate, async () => {
                  await createFolder(kbId, name);
                  setFolders(await listFolders(kbId));
                })
              }
              onRenameFolder={(id, name) =>
                run(assets.errFolderRename, async () => {
                  await renameFolder(kbId, id, name);
                  setFolders(await listFolders(kbId));
                })
              }
              onDeleteFolder={(folder) =>
                run(assets.errFolderDelete, async () => {
                  await deleteFolder(kbId, folder.id);
                  setFolders(await listFolders(kbId));
                  // The documents survive - reload them so the ones that just
                  // became unfiled show that, rather than staying filed under a
                  // folder the page no longer lists.
                  await loadDocs();
                  return m.okFolderDelete(folder.name);
                })
              }
            />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

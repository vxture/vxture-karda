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
} from "../../../_lib/api";
import { sharingMeta, apiErrorMessage, type PublishState } from "../../../_lib/format";
import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { DocumentPanel } from "./DocumentPanel";
import { SettingsPanel } from "./SettingsPanel";

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
  const params = useParams<{ kbId: string }>();
  const kbId = params.kbId;

  const [kb, setKb] = useState<Kb | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [templates, setTemplates] = useState<ProcessingTemplateOption[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [budget, setBudget] = useState<MetadataBudget | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      guard(e, "文档列表加载失败。");
    }
  }, [kbId, guard]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      setKb(await getKb(kbId));
    } catch (e) {
      guard(e, "库信息加载失败。");
      return;
    }
    await loadDocs();
    // The settings sources load together but must not take the page down with
    // them: a library is still usable if its template catalogue is unreachable,
    // so these failures are reported, not fatal.
    await Promise.all([
      listFolders(kbId).then(setFolders, (e) => guard(e, "目录加载失败。")),
      listProcessingTemplates().then(setTemplates, (e) => guard(e, "加工模板列表加载失败。")),
      listMetadataFields(kbId).then(
        (r) => {
          setFields(r.fields);
          setBudget(r.budget);
        },
        (e) => guard(e, "字段声明加载失败。"),
      ),
    ]);
  }, [kbId, guard, loadDocs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** Every mutation goes through here: one busy flag, one place that clears the
   *  old banners before acting, and one place that reports a failure. */
  const run = useCallback(
    async (fallback: string, fn: () => Promise<string | null | void>) => {
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
        title={kb?.name ?? "载入中…"}
        description={kb?.description ?? undefined}
        meta={
          docs
            ? `${docs.length} 文档${failedCount > 0 ? ` · ${failedCount} 失败` : ""}${
                kb ? ` · ${sharingMeta(kb.publishState).label}` : ""
              }`
            : undefined
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/">返回知识资产</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={error} />}
      {notice && <Banner tone="success" title={notice} />}

      {kb === null ? (
        <EmptyState title="正在加载库…" />
      ) : (
        <Tabs defaultValue="documents" className="flex flex-col gap-md">
          <TabsList>
            <TabsTrigger value="documents">文档{docs ? ` (${docs.length})` : ""}</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <DocumentPanel
              kb={kb}
              docs={docs}
              folders={folders}
              busy={busy}
              onUpload={(file, folderId) =>
                run("上传失败。", async () => {
                  await uploadDocument(kbId, file, undefined, folderId);
                  await loadDocs();
                  return `已上传「${file.name}」。`;
                })
              }
              onVerify={(doc) =>
                run("文档验证失败。", async () => {
                  await verifyDocument(kbId, doc.id);
                  await loadDocs();
                  return `已验证「${doc.title}」。`;
                })
              }
              onRetry={(doc) =>
                run("重新加工失败。", async () => {
                  await reprocessDocument(kbId, doc.id);
                  await loadDocs();
                  // Deliberately not "已完成": reprocess puts the document back
                  // in the queue, and claiming it succeeded would be a lie the
                  // user only discovers when it fails again.
                  return `「${doc.title}」已重新排队加工。`;
                })
              }
              onDelete={(doc) =>
                run("删除失败。", async () => {
                  await deleteDocument(kbId, doc.id);
                  await loadDocs();
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
                run("共享档位切换失败。", async () => {
                  if (kb.publishState === target) return;
                  setKb(await setSharing(kbId, target));
                  return `共享档位已设为「${sharingMeta(target).label}」。`;
                })
              }
              onTemplate={(templateId) =>
                run("加工模板切换失败。", async () => {
                  setKb(await setProcessingTemplate(kbId, templateId));
                  return "加工模板已保存。仅对此后加工的文档生效。";
                })
              }
              onGovernance={(enabled) =>
                run("治理开关切换失败。", async () => {
                  setKb(await setGovernance(kbId, enabled));
                })
              }
              onVerifierConfig={(verifier, intervalDays) =>
                run("治理设置保存失败。", async () => {
                  setKb(await setVerifierConfig(kbId, { defaultVerifier: verifier, defaultVerifyIntervalDays: intervalDays }));
                  return "治理设置已保存。";
                })
              }
              onFields={(next) =>
                run("字段声明保存失败。", async () => {
                  const r = await putMetadataFields(kbId, next);
                  setFields(r.fields);
                  setBudget(r.budget);
                  return "字段声明已保存。";
                })
              }
              onCreateFolder={(name) =>
                run("目录创建失败。", async () => {
                  await createFolder(kbId, name);
                  setFolders(await listFolders(kbId));
                })
              }
              onRenameFolder={(id, name) =>
                run("目录重命名失败。", async () => {
                  await renameFolder(kbId, id, name);
                  setFolders(await listFolders(kbId));
                })
              }
              onDeleteFolder={(folder) =>
                run("目录删除失败。", async () => {
                  await deleteFolder(kbId, folder.id);
                  setFolders(await listFolders(kbId));
                  // The documents survive - reload them so the ones that just
                  // became unfiled show that, rather than staying filed under a
                  // folder the page no longer lists.
                  await loadDocs();
                  return `目录「${folder.name}」已删除，其中的文档变为未归档。`;
                })
              }
            />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

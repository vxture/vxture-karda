"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Banner, Button, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@vxture/design-system";
import {
  getKb,
  listDocuments,
  type ParkedByDocument,
  listFolders,
  listMetadataFields,
  listProcessingTemplates,
  listBindings,
  listConnectors,
  getAssetSupply,
  getLibraryKarda,
  createBinding,
  bindingAction,
  uploadDocument,
  deleteDocument,
  reprocessDocument,
  setSharing,
  setGovernance,
  setProcessingTemplate,
  setEmbeddingModel,
  setRetrievalChannels,
  setSourceMode,
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
  type LibraryKarda,
  type SourceMode,
} from "../../../_lib/api";
import { type PublishState } from "../../../_lib/format";
import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { DocumentPanel } from "./DocumentPanel";
import { LifecycleStrip } from "./LifecycleStrip";
import { SettingsPanel } from "./SettingsPanel";
import { BindingPanel } from "./BindingPanel";
import { useFormat, type Failure } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import type { Message } from "../../../_i18n/catalog";
import { assets } from "../../../_i18n/messages/assets";

// One library. This component owns all server state and every mutation; the
// panels are presentational and take handlers, so there is exactly one place
// that knows how a failure is reported and when a reload is needed.
//
// 它渲染**两个视图**,由 `view` 决定,两条路由共用这一个组件:
//
//   content   /assets/:id           这个库里有什么
//   settings  /assets/:id/settings  这个库怎么运转
//
// 设置从 tab 里搬出来是因为它和另外两个**不在一个维度上**(owner 2026-08-30):
// 「文档」「外部来源」回答的是「里面有什么」,而「设置」回答的是「它怎么运转」——
// 把配置摆成内容的兄弟,等于说改一个库的策略和翻一页文档是同一类动作。搬成子路由
// 之后,设置有了自己的地址(可收藏、可直达、回退键管用),而不是一个刷新就丢的
// tab 状态。
//
// 共用一个组件而不是复制一份:两页需要的服务端数据是同一批,拆成两个组件就会有
// 两套加载与两套失败处理,而它们迟早各自长歪。
//
// Batch 10 rebuilt this from the ported Console page. What it gained is the
// whole acceptance criterion: an owner sets the library's templates and policy,
// uploads a document, READS it in place, sees it fail with a reason, fixes the
// cause, re-runs it, verifies it and publishes - without leaving the shell.
//
// Authorization stays server-side. Controls the caller may not be allowed to use
// are still shown, because a refusal that states its reason is more useful than
// a control that silently is not there.
/**
 * 「外部来源」tab 的计数。
 *
 * 只数活跃的会与面板内容对不上(面板还列着已撤销那一组),两个都数又会让人以为
 * 有那么多在同步。所以:**活跃数是主,已撤销单独缀一句**——它们是两种东西,
 * 一个数字表达不了。
 */
function bindingCount(bindings: Binding[], m: { bindRevokedSuffix: (n: number) => string }): string {
  const live = bindings.filter((b) => b.state !== "revoked").length;
  const revoked = bindings.length - live;
  return revoked > 0 ? ` (${live}${m.bindRevokedSuffix(revoked)})` : ` (${live})`;
}

/** 这一页在看什么。见文件头。 */
export type AssetView = "content" | "settings";

export function AssetClient({ view = "content" }: { view?: AssetView } = {}) {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const params = useParams<{ kbId: string }>();
  const kbId = params.kbId;

  const [kb, setKb] = useState<Kb | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  /** 每份驻留文档卡在什么原因上,按 document_id 索引。与 `docs` 同一趟取回。 */
  const [parked, setParked] = useState<ParkedByDocument>({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [templates, setTemplates] = useState<ProcessingTemplateOption[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [budget, setBudget] = useState<MetadataBudget | null>(null);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const [connectors, setConnectors] = useState<(ConnectorInfo & { code: string; meetsDeleteInvariant: boolean })[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 供给侧(7 日引用、常读方)。`null` = 还没取到或这个库还没有流量——**不是 0**。 */
  const [supply, setSupply] = useState<{ heat7d: number; topConsumers: string[] } | null>(null);
  /** 卡尔达产出。`null` = 还没取到——状态条上「抽取」那一段因此整段不出现,而不是
   *  先画一个 0 再跳成真值。 */
  const [karda, setKarda] = useState<LibraryKarda | null>(null);
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
      const r = await listDocuments(kbId);
      setDocs(r.documents);
      setParked(r.parked);
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
      // 供给侧取不到不报错:这条线只是状态条上的一格,它缺席时那一格显示「—」,
      // 而为它弹一条红 banner 会让人以为这个库出了问题。
      getAssetSupply(kbId).then(setSupply, () => setSupply(null)),
      // 同理:抽取读不到就让那一段缺席,而不是为它弹一条红 banner——这个库的文档、
      // 设置、来源全都还是好的。
      getLibraryKarda(kbId).then(setKarda, () => setKarda(null)),
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

  const settings = view === "settings";
  if (needsAuth) return <SignInGate href={loginHref(settings ? `/assets/${kbId}/settings` : `/assets/${kbId}`)} />;

  // 「外部来源」这一格出不出现,由**模式**决定,但不是只由模式决定:一个采集库被
  // 转成自建时,原来那些绑定不会自动消失——如果这里只看模式,它们会变成看不见却
  // 还在同步的东西。所以还有绑定就照样露出来,让人有地方去撤销。
  //
  // 这正是「默认不是约束」的另一半:模式塑造页面,但不隐藏事实。
  const liveBindings = (bindings ?? []).filter((b) => b.state !== "revoked").length;
  const showBindings = kb?.sourceMode === "synced" || (bindings ?? []).length > 0;

  const failedCount = (docs ?? []).filter((d) => d.contentState === "failed").length;

  // `kb && (...)`：三个面板都要一个非空的 kb，而它们落在 null 判断**之前**。用 `&&`
  // 而不是把判断提上来，是因为 `kb` 是 const —— 收窄会跟着进闭包，面板里那些回调
  // 拿到的照样是 Kb 而不是 Kb | null。
  // 三个面板先落成常量,再由视图决定摆哪几个。它们各自都是一整块带回调的 JSX,
  // 在两处分支里各抄一遍就等于有两份——而改动只会落到其中一份上。
  const documentPanel = kb && (
    <DocumentPanel
      kb={kb}
      docs={docs}
      parked={parked}
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
  );

  const bindingPanel = kb && (
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
  );

  const settingsPanel = kb && (
    <SettingsPanel
      kb={kb}
      folders={folders}
      templates={templates}
      fields={fields}
      budget={budget}
      busy={busy}
      liveBindings={liveBindings}
      onSourceMode={(mode) =>
        run(assets.errModeSwitch, async () => {
          if (kb.sourceMode === mode) return;
          setKb(await setSourceMode(kbId, mode));
          return m.okModeSwitch(mode === "synced" ? m.modeSynced : m.modeOwned);
        })
      }
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
      onEmbedding={(model) =>
        run(assets.errVectorSave, async () => {
          setKb(await setEmbeddingModel(kbId, model));
          return model ? m.okVectorLocked(model) : m.okVectorUnlocked;
        })
      }
      onRetrieval={(patch) =>
        run(assets.errRetrievalSave, async () => {
          setKb(await setRetrievalChannels(kbId, patch));
          return m.okRetrievalSave;
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
  );

  return (
    <>
      <PageHead
        title={settings && kb ? m.settingsTitle(kb.name) : (kb?.name ?? c.loading)}
        description={settings ? m.settingsDesc : (kb?.description ?? undefined)}
        meta={
          settings || !docs
            ? undefined
            : `${m.metaDocs(docs.length)}${failedCount > 0 ? ` \u00b7 ${m.metaFailed(failedCount)}` : ""}${
                kb ? ` \u00b7 ${f.sharing(kb.publishState).label}` : ""
              }`
        }
        actions={
          settings ? (
            // 返回回到**上一层**，也就是这个库本身——不是资产列表。KD-214 那次就是在
            // 这一行上跌的：路由变了，返回目标没跟着变，于是“返回”把人送到了另一层。
            <Button variant="outline" asChild>
              <Link href={`/assets/${kbId}`}>{m.backToLibrary}</Link>
            </Button>
          ) : (
            <>
              {/* 知识确认台的门。放在设置前面:它是内容的一部分(卡尔达抽出的知识),
                  比配置离这一页更近。 */}
              <Button variant="outline" asChild>
                <Link href={`/assets/${kbId}/knowledge`}>{m.knowledgeLabel}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/assets/${kbId}/settings`}>{m.settingsLabel}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/assets">{m.backToAssets}</Link>
              </Button>
            </>
          )
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}

      {/* 五条业务流在这个库上的交汇。只在内容视图上：设置页回答的是“它怎么运转”，
          而这条带说的是“它现在怎么样”——摆在设置页顶上只会把真正要改的东西推下去。 */}
      {!settings && kb && docs && bindings && (
        <LifecycleStrip kb={kb} docs={docs} parked={parked} bindings={bindings} supply={supply} karda={karda} />
      )}

      {/* **加载中与加载失败不是同一件事**（owner 2026-08-29）。`getKb` 失败时 `kb`
          也保持 null，于是页面同时显示一条红 banner 和「正在加载库…」，而且没有
          任何重试入口——只能刷新。一个把失败画成「还在转」的空态，会让人一直等。 */}
      {kb === null ? (
        error ? (
          <EmptyState
            icon="warning"
            title={m.kbLoadFailed}
            description={m.kbLoadFailedHint}
            action={
              <Button variant="outline" onClick={() => void loadAll()}>
                {c.retry}
              </Button>
            }
          />
        ) : (
          <EmptyState title={m.kbLoading} />
        )
      ) : settings ? (
        settingsPanel
      ) : showBindings ? (
        // 采集库里、或者手上还拿着绑定的库里，内容和来源是两件要分开看的事，所以保留 tab。
        // 默认落在哪一格跟着模式走：采集库的主角是「来源与同步状态」，而一个已经
        // 转回自建、只剩下旧绑定等着被撤销的库，主角仍然是它的文档。
        <Tabs
          defaultValue={kb.sourceMode === "synced" ? "bindings" : "documents"}
          className="flex flex-col gap-md"
        >
          <TabsList>
            <TabsTrigger value="documents">{m.tabDocuments}{docs ? ` (${docs.length})` : ""}</TabsTrigger>
            <TabsTrigger value="bindings">
              {/* 计数排除已撤销，而面板里仍然列着已撤销那一组——于是标签写着 (0)，
                  下面却有内容（owner 2026-08-29）。改成：有已撤销时把它单独写出来，
                  而不是让两个数字互相拆台。 */}
              {m.tabBindings}
              {bindings ? bindingCount(bindings, m) : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents">{documentPanel}</TabsContent>
          <TabsContent value="bindings">{bindingPanel}</TabsContent>
        </Tabs>
      ) : (
        // 自建库：内容就是全部，不给它套一个只有一格的 tab 条——那只会让人
        // 找另一格在哪里。
        documentPanel
      )}
    </>
  );
}

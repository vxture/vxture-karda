"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  DestructiveButton,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Icon,
  Input,
  NativeSelect,
  Progress,
  SectionHeader,
  SectionNav,
  SegmentedControl,
  Switch,
  Textarea,
  type SectionNavItem,
} from "@vxture/design-system";
import {
  type Folder,
  type Kb,
  type MetadataBudget,
  type MetadataField,
  type ProcessingTemplateOption,
  type SourceMode,
} from "../../../_lib/api";
import { PUBLISH_ORDER, type PublishState } from "../../../_lib/format";
import { FIELD_NAME_RE } from "../../../kb/lib/metadata";
import { useFormat } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";
import { evaluation } from "../../../_i18n/messages/evaluation";

// 一个库的设置 —— 重设计(KD-224,owner 2026-08-30「重构布局、信息展示、配置、
// 选择」)。
//
// 旧页是八张**等宽等重**的卡从上排到底:改一个开关要滚过全部;「这个库现在是怎么
// 配的」没有任何一处一眼可见;「按内容一生排」的脊梁只存在于一句副标题里,布局上
// 看不出来。重设计立三条:
//
//   1. **左导航即概要。** `SectionNav` 的每一项副行就是当前值(模式、模板、通道、
//      档位……)——看导航即看配置,点导航即达板块。信息展示层与修改层由此分开:
//      前者一屏,后者按需。
//   2. **生命周期成为可见结构。** 板块顺序仍是 身份 → 来源 → 入库 → 加工 → 检索 →
//      治理 → 共享,但现在它是左侧一列可点的骨架,不是一句话。
//   3. **表单行用 DS 的 Field 族**,标签/控件/说明/错误的间距字级一次定齐——旧页
//      每张卡各摆各的,这正是「毫无逻辑」观感的来源之一。
//
// 本次补上的两个真缺口:**改名**(服务端一直支持,界面从来没有出口)和**删除本库**
// (只能建不能删,危险区补齐)。滚动联动用 IntersectionObserver:点导航滚过去,
// 滚页面时导航跟着亮——两个方向都成立,联动才算数。

export type SectionKey =
  | "identity"
  | "source"
  | "ingest"
  | "processing"
  | "retrieval"
  | "governance"
  | "sharing"
  | "danger";

const SECTION_ORDER: SectionKey[] = [
  "identity",
  "source",
  "ingest",
  "processing",
  "retrieval",
  "governance",
  "sharing",
  "danger",
];

export function SettingsPanel({
  kb,
  folders,
  templates,
  fields,
  budget,
  busy,
  liveBindings,
  onMeta,
  onSourceMode,
  onShare,
  onTemplate,
  onEmbedding,
  onRetrieval,
  onGovernance,
  onExempt,
  onVerifierConfig,
  onFields,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDelete,
}: {
  kb: Kb;
  folders: Folder[];
  templates: ProcessingTemplateOption[];
  fields: MetadataField[];
  budget: MetadataBudget | null;
  busy: boolean;
  /** 还在同步的外部来源数。采集 -> 自建是唯一会留下矛盾的方向,警告要有数字。 */
  liveBindings: number;
  onMeta: (name: string, description: string | null) => void | Promise<void>;
  onSourceMode: (mode: SourceMode) => void | Promise<void>;
  onShare: (target: PublishState) => void | Promise<void>;
  onTemplate: (templateId: string | null) => void | Promise<void>;
  onEmbedding: (model: string | null) => void | Promise<void>;
  onRetrieval: (patch: { fulltextEnabled?: boolean; graphEnabled?: boolean }) => void | Promise<void>;
  onGovernance: (enabled: boolean) => void | Promise<void>;
  onExempt: (exemptSyncedContent: boolean) => void | Promise<void>;
  onVerifierConfig: (verifier: string | null, intervalDays: number | null) => void | Promise<void>;
  onFields: (fields: MetadataField[]) => void | Promise<void>;
  onCreateFolder: (name: string) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
  onDeleteFolder: (folder: Folder) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const f = useFormat();

  const [active, setActive] = useState<SectionKey>("identity");
  const refs = useRef(new Map<SectionKey, HTMLElement>());
  /** 点导航后的短暂静默:programmatic 滚动途中 observer 会把路过的板块逐个点亮,
   *  高亮闪成跑马灯。点击直接定住目标,滚动结束再交还给 observer。 */
  const clickLock = useRef<number>(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLock.current) return;
        // 取视口上缘带里最靠前的可见板块——「正在读哪一段」的朴素定义。
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.getAttribute("data-section") as SectionKey);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    for (const el of refs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const jump = (key: SectionKey) => {
    setActive(key);
    clickLock.current = Date.now() + 800;
    refs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const currentTemplate = templates.find((t) => t.id === kb.processingTemplateId) ?? null;

  // 导航项的副行 = 当前值。这一列就是旧页完全缺失的「配置概要」层。
  const navItems: SectionNavItem[] = useMemo(() => {
    const chan = `${m.retrievalFulltext} ${kb.fulltextEnabled ? c.on : c.off} · ${m.retrievalGraph} ${
      kb.graphEnabled ? c.on : c.off
    }`;
    const items: Record<SectionKey, SectionNavItem> = {
      identity: { key: "identity", label: m.secIdentity, description: kb.description || m.navNoDescription },
      source: {
        key: "source",
        label: m.modeCardTitle,
        description: kb.sourceMode === "synced" ? m.modeSynced : m.modeOwned,
      },
      ingest: { key: "ingest", label: m.secIngest, description: m.navFolders(folders.length) },
      processing: {
        key: "processing",
        label: m.secProcessing,
        description: `${currentTemplate?.name ?? m.templateDefault} · ${kb.embeddingModel ?? m.navVectorRouted}`,
      },
      retrieval: { key: "retrieval", label: m.secRetrieval, description: chan },
      governance: {
        key: "governance",
        label: ev.govTitle,
        description: kb.governanceEnabled ? `${c.on} · ${f.interval(kb.defaultVerifyIntervalDays)}` : c.off,
      },
      sharing: { key: "sharing", label: m.shareCardTitle, description: f.sharing(kb.publishState).label },
      danger: { key: "danger", label: m.secDanger, description: m.deleteKbAction },
    };
    return SECTION_ORDER.map((k) => items[k]);
  }, [m, ev, c, f, kb, folders.length, currentTemplate]);

  const bind = (key: SectionKey) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  // 两列自排,不用 DS 的 SplitViewLayout,两条实测理由:它的 `md:items-start` 把
  // 导航列压成自身内容高,sticky 概要在 523px 的列里没有行程,滚一屏就跟着消失
  // (真库上看见);它的断点是**视口**的 `md:`,而 130 §3 规定列数跟容器走——侧栏
  // 开合改变的是容器宽度,视口一动不动。列默认 stretch(不写 items-start),导航列
  // 与内容列等高,sticky 才有整页的行程。
  return (
    <div className="flex flex-col gap-lg @min-[56rem]:flex-row">
      <div className="w-full shrink-0 @min-[56rem]:w-64">
        <div className="sticky top-lg">
          <SectionNav items={navItems} activeKey={active} onSelect={(k) => jump(k as SectionKey)} aria-label={m.setNavAria} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex max-w-[52rem] flex-col gap-2xl">
          <section ref={bind("identity")} data-section="identity" className="scroll-mt-lg">
            <IdentitySection kb={kb} busy={busy} onMeta={onMeta} />
          </section>
          <section ref={bind("source")} data-section="source" className="scroll-mt-lg">
            <SourceSection kb={kb} liveBindings={liveBindings} busy={busy} onSourceMode={onSourceMode} />
          </section>
          <section ref={bind("ingest")} data-section="ingest" className="scroll-mt-lg">
            <FoldersSection
              folders={folders}
              busy={busy}
              onCreate={onCreateFolder}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            />
          </section>
          <section ref={bind("processing")} data-section="processing" className="scroll-mt-lg">
            <ProcessingSection kb={kb} templates={templates} busy={busy} onTemplate={onTemplate} onEmbedding={onEmbedding} />
          </section>
          <section ref={bind("retrieval")} data-section="retrieval" className="scroll-mt-lg">
            <RetrievalSection kb={kb} fields={fields} budget={budget} busy={busy} onRetrieval={onRetrieval} onFields={onFields} />
          </section>
          <section ref={bind("governance")} data-section="governance" className="scroll-mt-lg">
            <GovernanceSection
              kb={kb}
              busy={busy}
              onGovernance={onGovernance}
              onExempt={onExempt}
              onVerifierConfig={onVerifierConfig}
            />
          </section>
          <section ref={bind("sharing")} data-section="sharing" className="scroll-mt-lg">
            <SharingSection kb={kb} busy={busy} onShare={onShare} />
          </section>
          <section ref={bind("danger")} data-section="danger" className="scroll-mt-lg">
            <DangerSection kb={kb} busy={busy} onDelete={onDelete} />
          </section>
        </div>
      </div>
    </div>
  );
}

// --- 身份:改名与描述(旧页的真缺口——服务端一直支持,界面从来没有出口) --------------

function IdentitySection({
  kb,
  busy,
  onMeta,
}: {
  kb: Kb;
  busy: boolean;
  onMeta: (name: string, description: string | null) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const c = useMessages(common);
  const [name, setName] = useState(kb.name);
  const [desc, setDesc] = useState(kb.description ?? "");
  useEffect(() => {
    setName(kb.name);
    setDesc(kb.description ?? "");
  }, [kb]);
  const dirty = name.trim() !== kb.name || desc.trim() !== (kb.description ?? "");

  return (
    <>
      <SectionHeader level={2} icon="text-t" title={m.secIdentity} description={m.secIdentityDesc} />
      <FieldGroup className="pt-md">
        <Field>
          <FieldLabel htmlFor="set-name">{m.createNameLabel}</FieldLabel>
          <Input
            id="set-name"
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            className="w-[28rem] max-w-full"
            disabled={busy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="set-desc">{m.createDescLabel}</FieldLabel>
          <Textarea
            id="set-desc"
            value={desc}
            rows={2}
            onChange={(e) => setDesc(e.target.value)}
            className="w-[28rem] max-w-full"
            disabled={busy}
          />
        </Field>
        <div>
          <Button variant="default" disabled={busy || !dirty || !name.trim()} onClick={() => onMeta(name.trim(), desc.trim() || null)}>
            {c.save}
          </Button>
        </div>
      </FieldGroup>
    </>
  );
}

// --- 来源模式(KD-218) ---------------------------------------------------------------

function SourceSection({
  kb,
  liveBindings,
  busy,
  onSourceMode,
}: {
  kb: Kb;
  liveBindings: number;
  busy: boolean;
  onSourceMode: (mode: SourceMode) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const synced = kb.sourceMode === "synced";
  return (
    <>
      <SectionHeader
        level={2}
        icon="plugs-connected"
        title={m.modeCardTitle}
        description={synced ? m.modeSyncedDesc : m.modeOwnedDesc}
      />
      <FieldGroup className="pt-md">
        <Field>
          {/* 控件宽度跟着选项走,不铺满行:两个两字选项摊在 52rem 上,读起来像一条
              空槽里丢了两粒字。 */}
          <div className="w-[18rem] max-w-full">
            <SegmentedControl
              items={[
                { value: "owned", label: m.modeOwned },
                { value: "synced", label: m.modeSynced },
              ]}
              value={kb.sourceMode}
              onChange={(v) => onSourceMode(v as SourceMode)}
              fill
              ariaLabel={m.modeCardTitle}
            />
          </div>
          <FieldDescription>
            {m.modeHint} {m.modeSwitchHint}
          </FieldDescription>
          {/* 采集 -> 自建而来源还连着:转过去之后它们**仍然在同步**。不是禁止,
              是把后果说清楚。 */}
          {synced && liveBindings > 0 && (
            <p className="text-body-sm text-warning-text">{m.modeSwitchWarn(liveBindings)}</p>
          )}
        </Field>
      </FieldGroup>
    </>
  );
}

// --- 入库:目录 ---------------------------------------------------------------------

function FoldersSection({
  folders,
  busy,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: Folder[];
  busy: boolean;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (folder: Folder) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const c = useMessages(common);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <>
      <SectionHeader level={2} icon="folder" title={m.foldersCardTitle} description={m.foldersCardDesc} />
      <div className="flex flex-col pt-sm">
        {folders.map((fo) => (
          <div key={fo.id} className="flex items-center gap-sm border-b border-border/60 py-sm last:border-b-0">
            {editing === fo.id ? (
              <>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={m.folderRenameAria(fo.name)}
                  className="w-[20rem] max-w-full"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void onRename(fo.id, draft.trim());
                      setEditing(null);
                    }
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="default"
                  disabled={busy || !draft.trim()}
                  onClick={() => {
                    void onRename(fo.id, draft.trim());
                    setEditing(null);
                  }}
                >
                  {c.save}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  {c.cancel}
                </Button>
              </>
            ) : (
              <>
                <Icon name="folder" className="text-muted-foreground" />
                <span className="truncate text-body-md">{fo.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => {
                    setEditing(fo.id);
                    setDraft(fo.name);
                  }}
                >
                  {c.rename}
                </Button>
                {/* 删目录会把里面**所有**文档变成未归档——与删一份文档同等的保护
                    强度(owner 2026-08-29)。 */}
                <DestructiveButton
                  size="sm"
                  disabled={busy}
                  confirm={{
                    verb: c.delete,
                    target: fo.name,
                    consequence: m.folderDeleteConsequence,
                    onConfirm: () => Promise.resolve(onDelete(fo)),
                  }}
                >
                  {c.delete}
                </DestructiveButton>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-sm pt-sm">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.folderNewPlaceholder}
            aria-label={m.folderNewPlaceholder}
            className="w-[20rem] max-w-full"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                void onCreate(name.trim());
                setName("");
              }
            }}
          />
          <Button
            disabled={busy || !name.trim()}
            onClick={() => {
              void onCreate(name.trim());
              setName("");
            }}
          >
            <Icon name="plus" />
            {m.folderCreate}
          </Button>
        </div>
      </div>
    </>
  );
}

// --- 加工:模板 + 向量空间(同一节——两件事共同决定内容怎样变得可检索) ----------------

function ProcessingSection({
  kb,
  templates,
  busy,
  onTemplate,
  onEmbedding,
}: {
  kb: Kb;
  templates: ProcessingTemplateOption[];
  busy: boolean;
  onTemplate: (templateId: string | null) => void | Promise<void>;
  onEmbedding: (model: string | null) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const c = useMessages(common);
  const current = templates.find((t) => t.id === kb.processingTemplateId) ?? null;
  const [draft, setDraft] = useState(kb.embeddingModel ?? "");
  useEffect(() => setDraft(kb.embeddingModel ?? ""), [kb]);
  const vectorDirty = (kb.embeddingModel ?? "") !== draft.trim();

  return (
    <>
      <SectionHeader level={2} icon="cpu" title={m.secProcessing} description={m.secProcessingDesc} />
      <FieldGroup className="pt-md">
        <Field>
          <FieldLabel htmlFor="set-template">{m.templateCardTitle}</FieldLabel>
          <NativeSelect
            id="set-template"
            value={kb.processingTemplateId ?? ""}
            disabled={busy || templates.length === 0}
            onChange={(e) => onTemplate(e.target.value || null)}
            wrapperClassName="w-[24rem] max-w-full"
          >
            <option value="">{m.templateDefault}</option>
            {templates.map((t) => (
              <option key={t.templateCode} value={t.id ?? ""} disabled={t.id === null}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>
            {m.templateCardDesc}
            {current && (
              <span className="ml-xs font-mono text-code-sm">
                {m.templateSpec(current.targetTokens, current.maxTokens)}
              </span>
            )}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="set-vector">{m.vectorCardTitle}</FieldLabel>
          <div className="flex flex-wrap items-center gap-sm">
            <Input
              id="set-vector"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={m.vectorPlaceholder}
              className="w-[22rem] max-w-full"
              disabled={busy}
            />
            <Button size="sm" disabled={busy || !vectorDirty} onClick={() => onEmbedding(draft.trim() || null)}>
              {c.save}
            </Button>
          </div>
          {/* 改锁的代价写在按钮旁边,不只写在文档里:换模型 = 换向量空间,旧向量与
              新查询不可比,已入藏的内容要重建才回得来检索。 */}
          <FieldDescription>
            {kb.embeddingModel ? m.vectorLocked(kb.embeddingModel) : m.vectorUnlocked} {m.vectorHint}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </>
  );
}

// --- 检索:召回通道 + 可筛字段 --------------------------------------------------------

/** 字段类型的说法。值域在 `kb/lib/metadata.ts`,这里只负责它的语言;认不出来的值
 *  原样返回——一个客户端没见过的值是部署错位的信号,原样印出来才看得见。 */
function typeLabel(
  t: MetadataField["valueType"],
  m: { fieldTypeString: string; fieldTypeNumber: string; fieldTypeDatetime: string; fieldTypeEnum: string },
): string {
  const map: Record<string, string> = {
    string: m.fieldTypeString,
    number: m.fieldTypeNumber,
    datetime: m.fieldTypeDatetime,
    enum: m.fieldTypeEnum,
  };
  return map[t] ?? t;
}

function RetrievalSection({
  kb,
  fields,
  budget,
  busy,
  onRetrieval,
  onFields,
}: {
  kb: Kb;
  fields: MetadataField[];
  budget: MetadataBudget | null;
  busy: boolean;
  onRetrieval: (patch: { fulltextEnabled?: boolean; graphEnabled?: boolean }) => void | Promise<void>;
  onFields: (fields: MetadataField[]) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const c = useMessages(common);
  const [draft, setDraft] = useState<MetadataField[]>(fields);
  const [name, setName] = useState("");
  const [type, setType] = useState<MetadataField["valueType"]>("string");
  // The server is the source of truth; re-sync whenever it answers.
  useEffect(() => setDraft(fields), [fields]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(fields);
  const nameValid = name === "" || FIELD_NAME_RE.test(name);
  const duplicate = draft.some((x) => x.fieldName === name);
  const systemCount = budget ? budget.used - fields.filter((x) => x.filterable).length : 0;
  const draftUsed = systemCount + draft.filter((x) => x.filterable).length;
  const cap = budget?.cap ?? 16;
  const over = draftUsed > cap;

  function add() {
    if (!name || !nameValid || duplicate) return;
    setDraft([...draft, { fieldName: name, valueType: type, filterable: false }]);
    setName("");
  }

  return (
    <>
      <SectionHeader level={2} icon="search" title={m.secRetrieval} description={m.secRetrievalDesc} />
      <FieldGroup className="pt-md">
        {/* 召回通道:开关行 —— 标签与说明在右,可点整行。 */}
        <label className="flex items-center gap-sm">
          <Switch
            checked={kb.fulltextEnabled}
            disabled={busy}
            aria-label={m.retrievalFulltext}
            onCheckedChange={(v) => onRetrieval({ fulltextEnabled: v })}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-md">{m.retrievalFulltext}</span>
            <span className="text-body-sm text-muted-foreground">{m.retrievalFulltextHint}</span>
          </span>
        </label>
        <label className="flex items-center gap-sm">
          <Switch
            checked={kb.graphEnabled}
            disabled={busy}
            aria-label={m.retrievalGraph}
            onCheckedChange={(v) => onRetrieval({ graphEnabled: v })}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-md">{m.retrievalGraph}</span>
            <span className="text-body-sm text-muted-foreground">{m.retrievalGraphHint}</span>
          </span>
        </label>
      </FieldGroup>

      <div className="pt-lg">
        <SectionHeader level={3} title={m.fieldsCardTitle} description={m.fieldsCardDesc} />
        <div className="flex flex-col gap-md pt-sm">
          <div className="flex flex-col gap-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-muted-foreground">
                {m.fieldsBudget(draftUsed, cap)}
                {budget && budget.systemDimensions.length > 0 && (
                  <>{m.fieldsSystemDims(budget.systemDimensions.length, budget.systemDimensions)}</>
                )}
              </span>
              {over && <span className="text-body-sm text-destructive">{m.fieldsOverCap}</span>}
            </div>
            {/* Over-cap turns the bar red via the class - Progress takes no tone.
                Clamped at 100% so over-budget reads as "full and past it". */}
            <Progress value={Math.min(100, (draftUsed / cap) * 100)} className={over ? "[&>*]:bg-destructive" : undefined} />
          </div>

          {draft.length > 0 && (
            <div className="flex flex-col">
              {draft.map((x, i) => (
                <div key={x.fieldName} className="flex items-center gap-md border-t border-border/60 py-sm first:border-t-0">
                  <span className="w-[14rem] truncate font-mono text-code-sm">{x.fieldName}</span>
                  <span className="w-[6rem] text-body-sm text-muted-foreground">{typeLabel(x.valueType, m)}</span>
                  <label className="flex items-center gap-xs text-body-sm">
                    <Checkbox
                      checked={x.filterable}
                      disabled={busy}
                      onCheckedChange={(v) => setDraft(draft.map((y, j) => (j === i ? { ...y, filterable: v === true } : y)))}
                      aria-label={m.fieldFilterableAria(x.fieldName)}
                    />
                    {m.fieldFilterable}
                  </label>
                  <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                    {m.fieldRemove}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-sm">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.fieldNamePlaceholder}
              aria-label={m.fieldNameAria}
              className="w-[20rem] max-w-full"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <NativeSelect
              value={type}
              onChange={(e) => setType(e.target.value as MetadataField["valueType"])}
              aria-label={m.fieldTypeAria}
              wrapperClassName="w-[8rem]"
              disabled={busy}
            >
              <option value="string">{m.fieldTypeString}</option>
              <option value="number">{m.fieldTypeNumber}</option>
              <option value="datetime">{m.fieldTypeDatetime}</option>
              <option value="enum">{m.fieldTypeEnum}</option>
            </NativeSelect>
            <Button disabled={busy || !name || !nameValid || duplicate} onClick={add}>
              <Icon name="plus" />
              {m.fieldAdd}
            </Button>
          </div>
          {!nameValid && <p className="text-body-sm text-destructive">{m.fieldNameInvalid}</p>}
          {duplicate && <p className="text-body-sm text-destructive">{m.fieldNameDuplicate}</p>}
          {draft.some((x) => x.valueType === "enum" && !x.enumValues?.length) && (
            <p className="text-body-sm text-muted-foreground">{m.fieldEnumUnsupported}</p>
          )}

          <div className="flex items-center gap-sm">
            <Button variant="default" disabled={busy || !dirty || over} onClick={() => onFields(draft)}>
              {m.fieldsSave}
            </Button>
            {dirty && (
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(fields)}>
                {m.fieldsDiscard}
              </Button>
            )}
            {/* Whole-set write (delete+insert): a partial save cannot happen,
                and the user should know before pressing. */}
            <span className="text-body-sm text-muted-foreground">{m.fieldsWholeSetHint}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// --- 治理 ---------------------------------------------------------------------------

function GovernanceSection({
  kb,
  busy,
  onGovernance,
  onExempt,
  onVerifierConfig,
}: {
  kb: Kb;
  busy: boolean;
  onGovernance: (enabled: boolean) => void | Promise<void>;
  onExempt: (exemptSyncedContent: boolean) => void | Promise<void>;
  onVerifierConfig: (verifier: string | null, intervalDays: number | null) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const f = useFormat();
  const [verifier, setVerifier] = useState(kb.defaultVerifier ?? "");
  const [interval, setIntervalStr] = useState(
    kb.defaultVerifyIntervalDays != null ? String(kb.defaultVerifyIntervalDays) : "",
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setVerifier(kb.defaultVerifier ?? "");
    setIntervalStr(kb.defaultVerifyIntervalDays != null ? String(kb.defaultVerifyIntervalDays) : "");
  }, [kb]);

  function save() {
    const raw = interval.trim();
    const days = raw === "" ? null : Number(raw);
    if (days !== null && (!Number.isInteger(days) || days <= 0)) {
      setErr(m.govIntervalInvalid);
      return;
    }
    setErr(null);
    void onVerifierConfig(verifier.trim() || null, days);
  }

  return (
    <>
      <SectionHeader
        level={2}
        icon="shield-check"
        title={ev.govTitle}
        description={kb.governanceEnabled ? m.govOn(f.interval(kb.defaultVerifyIntervalDays)) : m.govOff}
        action={
          <Switch
            checked={kb.governanceEnabled}
            disabled={busy}
            onCheckedChange={(v) => onGovernance(v)}
            aria-label={m.govSwitchAria}
          />
        }
      />
      {kb.governanceEnabled && (
        <FieldGroup className="pt-md">
          <Field>
            <FieldLabel htmlFor="set-verifier">{m.govVerifierLabel}</FieldLabel>
            <Input
              id="set-verifier"
              value={verifier}
              onChange={(e) => setVerifier(e.target.value)}
              placeholder={m.govVerifierPlaceholder}
              className="w-[22rem] max-w-full"
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="set-interval">{m.govIntervalLabel}</FieldLabel>
            <div className="flex items-center gap-sm">
              <Input
                id="set-interval"
                value={interval}
                onChange={(e) => setIntervalStr(e.target.value)}
                placeholder={m.govIntervalPlaceholder}
                inputMode="numeric"
                className="w-[10rem]"
                disabled={busy}
              />
              <Button disabled={busy} onClick={save}>
                {c.save}
              </Button>
            </div>
            {err && <p className="text-body-sm text-destructive">{err}</p>}
            <FieldDescription>{m.govExplainer}</FieldDescription>
          </Field>
          {/* 同步内容的豁免覆盖(KD-218 库级覆盖,100-kb-model §5.2)。开关问「纳不
              纳入」而不是「豁不豁免」——双重否定的开关没人能一眼读对,所以取反。 */}
          <label className="flex items-center gap-sm">
            <Switch
              checked={!kb.exemptSyncedContent}
              disabled={busy}
              aria-label={m.govSyncedLabel}
              onCheckedChange={(v) => onExempt(!v)}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-body-md">{m.govSyncedLabel}</span>
              <span className="text-body-sm text-muted-foreground">{m.govSyncedHint}</span>
            </span>
          </label>
        </FieldGroup>
      )}
    </>
  );
}

// --- 共享(唯一对外的一节,倒数第二;最后是危险区) ------------------------------------

function SharingSection({
  kb,
  busy,
  onShare,
}: {
  kb: Kb;
  busy: boolean;
  onShare: (target: PublishState) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const f = useFormat();
  const share = f.sharing(kb.publishState);
  return (
    <>
      <SectionHeader level={2} icon="share" title={m.shareCardTitle} description={share.help} />
      <FieldGroup className="pt-md">
        <Field>
          {/* Every rung is offered, including ones this caller may not climb.
              Authorization is server-side; surfacing the refusal tells the user
              WHY - a hidden control cannot distinguish "not permitted" from
              "does not exist". */}
          <div className="w-[24rem] max-w-full">
            <SegmentedControl
              items={PUBLISH_ORDER.map((s) => ({ value: s, label: f.sharing(s).label }))}
              value={kb.publishState}
              onChange={(v) => onShare(v as PublishState)}
              fill
              ariaLabel={m.shareCardTitle}
            />
          </div>
          <FieldDescription>{m.shareCardHint}</FieldDescription>
        </Field>
      </FieldGroup>
    </>
  );
}

// --- 危险区 -------------------------------------------------------------------------

function DangerSection({ kb, busy, onDelete }: { kb: Kb; busy: boolean; onDelete: () => void | Promise<void> }) {
  const m = useMessages(assets);
  const c = useMessages(common);
  return (
    <div className="rounded-lg border border-destructive-border/50 p-lg">
      <SectionHeader level={2} icon="warning" title={m.secDanger} description={m.deleteKbHint} divider={false} />
      {/* 后果句在按钮**旁边**说一遍、确认框里再拦一遍:旁边那份是按下去之前就
          该读到的,确认框那份是最后一道闸——两处不是重复,是两个时刻。 */}
      <div className="flex items-center gap-md pt-md">
        <DestructiveButton
          disabled={busy}
          confirm={{
            verb: c.delete,
            target: kb.name,
            consequence: m.deleteKbConsequence,
            onConfirm: () => Promise.resolve(onDelete()),
          }}
        >
          {m.deleteKbAction}
        </DestructiveButton>
        <span className="text-body-sm text-muted-foreground">{m.deleteKbConsequence}</span>
      </div>
    </div>
  );
}

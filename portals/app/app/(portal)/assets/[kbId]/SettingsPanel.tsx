"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Icon,
  Input,
  NativeSelect,
  Progress,
  SegmentedControl,
  Switch,
} from "@vxture/design-system";
import {
  type Folder,
  type Kb,
  type MetadataBudget,
  type MetadataField,
  type ProcessingTemplateOption,
} from "../../../_lib/api";
import { PUBLISH_ORDER, type PublishState } from "../../../_lib/format";
import { FIELD_NAME_RE } from "../../../kb/lib/metadata";
import { useFormat } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";
import { evaluation } from "../../../_i18n/messages/evaluation";

// Everything about a library that is a SETTING rather than a document. Four
// blocks in the order an owner actually meets them: who can see it, how its
// files get chunked, what may be filtered on, and how it is verified - plus the
// folder catalogue, which is settings because creating a folder is a decision
// about the library, while filing a document into one is not.

export function SettingsPanel({
  kb,
  folders,
  templates,
  fields,
  budget,
  busy,
  onShare,
  onTemplate,
  onGovernance,
  onVerifierConfig,
  onFields,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  kb: Kb;
  folders: Folder[];
  templates: ProcessingTemplateOption[];
  fields: MetadataField[];
  budget: MetadataBudget | null;
  busy: boolean;
  onShare: (target: PublishState) => void | Promise<void>;
  onTemplate: (templateId: string | null) => void | Promise<void>;
  onGovernance: (enabled: boolean) => void | Promise<void>;
  onVerifierConfig: (verifier: string | null, intervalDays: number | null) => void | Promise<void>;
  onFields: (fields: MetadataField[]) => void | Promise<void>;
  onCreateFolder: (name: string) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
  onDeleteFolder: (folder: Folder) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-md">
      <SharingCard kb={kb} busy={busy} onShare={onShare} />
      <ProcessingCard kb={kb} templates={templates} busy={busy} onTemplate={onTemplate} />
      <FilterFieldsCard fields={fields} budget={budget} busy={busy} onSave={onFields} />
      <GovernanceCard kb={kb} busy={busy} onGovernance={onGovernance} onVerifierConfig={onVerifierConfig} />
      <FoldersCard
        folders={folders}
        busy={busy}
        onCreate={onCreateFolder}
        onRename={onRenameFolder}
        onDelete={onDeleteFolder}
      />
    </div>
  );
}

function SharingCard({
  kb,
  busy,
  onShare,
}: {
  kb: Kb;
  busy: boolean;
  onShare: (target: PublishState) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const f = useFormat();
  const share = f.sharing(kb.publishState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.shareCardTitle}</CardTitle>
        <CardDescription>{share.help}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        {/* Every rung is offered, including ones this caller may not be allowed
            to climb. Authorization is server-side, so posting the target and
            surfacing the refusal tells the user WHY - hiding the control would
            leave them unable to tell "not permitted" from "does not exist". */}
        <SegmentedControl
          items={PUBLISH_ORDER.map((s) => ({ value: s, label: f.sharing(s).label }))}
          value={kb.publishState}
          onChange={(v) => onShare(v as PublishState)}
          fill
          ariaLabel={m.shareCardTitle}
        />
        <p className="text-body-sm text-muted-foreground">
          {m.shareCardHint}
        </p>
      </CardContent>
    </Card>
  );
}

function ProcessingCard({
  kb,
  templates,
  busy,
  onTemplate,
}: {
  kb: Kb;
  templates: ProcessingTemplateOption[];
  busy: boolean;
  onTemplate: (templateId: string | null) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const current = templates.find((t) => t.id === kb.processingTemplateId) ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.templateCardTitle}</CardTitle>
        <CardDescription>
          {m.templateCardDesc}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        <NativeSelect
          value={kb.processingTemplateId ?? ""}
          disabled={busy || templates.length === 0}
          aria-label={m.templateCardTitle}
          onChange={(e) => onTemplate(e.target.value || null)}
          // Width on the WRAPPER - DS anchors the arrow to the wrapper's right
          // edge, and a full-width wrapper also breaks any flex row it sits in.
          wrapperClassName="w-[24rem] max-w-full"
        >
          <option value="">{m.templateDefault}</option>
          {templates.map((t) => (
            // A template row with no id cannot be chosen - that is the offline
            // catalogue, listed so the six presets are visible rather than
            // presented as an empty picker.
            <option key={t.templateCode} value={t.id ?? ""} disabled={t.id === null}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        {current && (
          <p className="font-mono text-code-sm text-muted-foreground">
            {m.templateSpec(current.targetTokens, current.maxTokens)} · {current.note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** The filterable whitelist. Its whole reason for existing is that a filterable
 *  field is an INDEX someone pays for, so fields are stored by default and
 *  become filterable only when declared - which is why this card leads with the
 *  budget rather than the list. */
function FilterFieldsCard({
  fields,
  budget,
  busy,
  onSave,
}: {
  fields: MetadataField[];
  budget: MetadataBudget | null;
  busy: boolean;
  onSave: (fields: MetadataField[]) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const [draft, setDraft] = useState<MetadataField[]>(fields);
  const [name, setName] = useState("");
  const [type, setType] = useState<MetadataField["valueType"]>("string");

  // The server is the source of truth; re-sync whenever it answers. Without
  // this, a save that the server normalised would leave the form showing what
  // the user typed rather than what was stored.
  useEffect(() => setDraft(fields), [fields]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(fields);
  const nameValid = name === "" || FIELD_NAME_RE.test(name);
  const duplicate = draft.some((f) => f.fieldName === name);

  // Count against the same cap the server enforces - system dimensions
  // included. Showing the raw cap would overstate what is available by five.
  const systemCount = budget ? budget.used - fields.filter((f) => f.filterable).length : 0;
  const draftUsed = systemCount + draft.filter((f) => f.filterable).length;
  const cap = budget?.cap ?? 16;
  const over = draftUsed > cap;

  function add() {
    if (!name || !nameValid || duplicate) return;
    setDraft([...draft, { fieldName: name, valueType: type, filterable: false }]);
    setName("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.fieldsCardTitle}</CardTitle>
        <CardDescription>
          {m.fieldsCardDesc}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-md">
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
          {/* Over-cap turns the bar red via the class, not a `tone` prop -
              Progress does not take one. The bar is clamped at 100% so the
              over-budget case reads as "full and past it", with the number
              above carrying the actual overshoot. */}
          <Progress
            value={Math.min(100, (draftUsed / cap) * 100)}
            className={over ? "[&>*]:bg-destructive" : undefined}
          />
        </div>

        {draft.length > 0 && (
          <div className="flex flex-col">
            {draft.map((f, i) => (
              <div key={f.fieldName} className="flex items-center gap-md border-t border-border/60 py-sm first:border-t-0">
                <span className="w-[14rem] truncate font-mono text-code-sm">{f.fieldName}</span>
                <span className="w-[6rem] text-body-sm text-muted-foreground">{f.valueType}</span>
                <label className="flex items-center gap-xs text-body-sm">
                  <Checkbox
                    checked={f.filterable}
                    disabled={busy}
                    onCheckedChange={(v) =>
                      setDraft(draft.map((x, j) => (j === i ? { ...x, filterable: v === true } : x)))
                    }
                    aria-label={m.fieldFilterableAria(f.fieldName)}
                  />
                  {m.fieldFilterable}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
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
            className="w-[22rem] max-w-full"
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
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="datetime">datetime</option>
            <option value="enum">enum</option>
          </NativeSelect>
          <Button disabled={busy || !name || !nameValid || duplicate} onClick={add}>
            <Icon name="plus" />
            {m.fieldAdd}
          </Button>
        </div>
        {!nameValid && <p className="text-body-sm text-destructive">{m.fieldNameInvalid}</p>}
        {duplicate && <p className="text-body-sm text-destructive">{m.fieldNameDuplicate}</p>}
        {/* enum fields need their values, and the server refuses the whole set
            without them - say so here rather than letting the save 422. */}
        {draft.some((f) => f.valueType === "enum" && !f.enumValues?.length) && (
          <p className="text-body-sm text-muted-foreground">
            {m.fieldEnumUnsupported}
          </p>
        )}

        <div className="flex items-center gap-sm">
          <Button variant="default" disabled={busy || !dirty || over} onClick={() => onSave(draft)}>
            {m.fieldsSave}
          </Button>
          {dirty && (
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(fields)}>
              {m.fieldsDiscard}
            </Button>
          )}
          {/* The write is whole-set (delete+insert), so a partial save is not a
              thing that can happen - and the user should know that before they
              press it. */}
          <span className="text-body-sm text-muted-foreground">{m.fieldsWholeSetHint}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function GovernanceCard({
  kb,
  busy,
  onGovernance,
  onVerifierConfig,
}: {
  kb: Kb;
  busy: boolean;
  onGovernance: (enabled: boolean) => void | Promise<void>;
  onVerifierConfig: (verifier: string | null, intervalDays: number | null) => void | Promise<void>;
}) {
  const m = useMessages(assets);
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const f = useFormat();
  const [verifier, setVerifier] = useState(kb.defaultVerifier ?? "");
  const [interval, setInterval] = useState(
    kb.defaultVerifyIntervalDays != null ? String(kb.defaultVerifyIntervalDays) : "",
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setVerifier(kb.defaultVerifier ?? "");
    setInterval(kb.defaultVerifyIntervalDays != null ? String(kb.defaultVerifyIntervalDays) : "");
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-md">
        <div>
          <CardTitle>{ev.govTitle}</CardTitle>
          <CardDescription>
            {kb.governanceEnabled
              ? m.govOn(f.interval(kb.defaultVerifyIntervalDays))
              : m.govOff}
          </CardDescription>
        </div>
        <Switch
          checked={kb.governanceEnabled}
          disabled={busy}
          onCheckedChange={(v) => onGovernance(v)}
          aria-label={m.govSwitchAria}
        />
      </CardHeader>
      {kb.governanceEnabled && (
        <CardContent className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-end gap-md">
            <label className="flex flex-col gap-xs text-body-sm">
              <span className="text-muted-foreground">{m.govVerifierLabel}</span>
              <Input
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                placeholder={m.govVerifierPlaceholder}
                aria-label={m.govVerifierAria}
                className="w-[20rem] max-w-full"
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-xs text-body-sm">
              <span className="text-muted-foreground">{m.govIntervalLabel}</span>
              <Input
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                placeholder={m.govIntervalPlaceholder}
                inputMode="numeric"
                aria-label={m.govIntervalAria}
                className="w-[10rem]"
                disabled={busy}
              />
            </label>
            <Button disabled={busy} onClick={save}>
              {c.save}
            </Button>
          </div>
          {err && <p className="text-body-sm text-destructive">{err}</p>}
          <p className="text-body-sm text-muted-foreground">
            {m.govExplainer}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function FoldersCard({
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
  const ev = useMessages(evaluation);
  const c = useMessages(common);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.foldersCardTitle}</CardTitle>
        <CardDescription>
          {m.foldersCardDesc}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        {folders.map((f) => (
          <div key={f.id} className="flex items-center gap-sm border-t border-border/60 py-sm first:border-t-0">
            {editing === f.id ? (
              <>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={m.folderRenameAria(f.name)}
                  className="w-[20rem] max-w-full"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void onRename(f.id, draft.trim());
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
                    void onRename(f.id, draft.trim());
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
                <span className="truncate text-body-md">{f.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => {
                    setEditing(f.id);
                    setDraft(f.name);
                  }}
                >
                  {c.rename}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(f)}>
                  {c.delete}
                </Button>
              </>
            )}
          </div>
        ))}

        <div className="flex items-center gap-sm pt-xs">
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
      </CardContent>
    </Card>
  );
}

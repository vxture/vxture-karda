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
import { sharingMeta, formatInterval, PUBLISH_ORDER, type PublishState } from "../../../_lib/format";
import { FIELD_NAME_RE } from "../../../kb/lib/metadata";

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
  const share = sharingMeta(kb.publishState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>共享档位</CardTitle>
        <CardDescription>{share.help}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        {/* Every rung is offered, including ones this caller may not be allowed
            to climb. Authorization is server-side, so posting the target and
            surfacing the refusal tells the user WHY - hiding the control would
            leave them unable to tell "not permitted" from "does not exist". */}
        <SegmentedControl
          items={PUBLISH_ORDER.map((s) => ({ value: s, label: sharingMeta(s).label }))}
          value={kb.publishState}
          onChange={(v) => onShare(v as PublishState)}
          fill
          ariaLabel="共享档位"
        />
        <p className="text-body-sm text-muted-foreground">
          自有库可发布到工作区；开放到全组织是管理员操作。
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
  const current = templates.find((t) => t.id === kb.processingTemplateId) ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>加工模板</CardTitle>
        <CardDescription>
          决定文件如何被切成可检索的块。切换只影响此后加工的文档，已入库的内容需要重新加工才会跟随。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-sm">
        <NativeSelect
          value={kb.processingTemplateId ?? ""}
          disabled={busy || templates.length === 0}
          aria-label="加工模板"
          onChange={(e) => onTemplate(e.target.value || null)}
          // Width on the WRAPPER - DS anchors the arrow to the wrapper's right
          // edge, and a full-width wrapper also breaks any flex row it sits in.
          wrapperClassName="w-[24rem] max-w-full"
        >
          <option value="">默认（通用）</option>
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
            目标 {current.targetTokens} token · 上限 {current.maxTokens} · {current.note}
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
        <CardTitle>业务字段与可筛选白名单</CardTitle>
        <CardDescription>
          字段默认只存储。勾选「可筛选」才会建索引——每个可筛选字段都是一份要付费的索引，所以有上限。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <div className="flex items-baseline justify-between">
            <span className="text-body-sm text-muted-foreground">
              可筛选维度 {draftUsed} / {cap}
              {budget && budget.systemDimensions.length > 0 && (
                <> （含 {budget.systemDimensions.length} 个系统维度：{budget.systemDimensions.join("、")}）</>
              )}
            </span>
            {over && <span className="text-body-sm text-destructive">超出上限</span>}
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
                    aria-label={`${f.fieldName} 可筛选`}
                  />
                  可筛选
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="字段名（小写字母开头，可含数字与下划线）"
            aria-label="新字段名"
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
            aria-label="字段类型"
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
            添加字段
          </Button>
        </div>
        {!nameValid && <p className="text-body-sm text-destructive">字段名需以小写字母开头，只含小写字母、数字与下划线。</p>}
        {duplicate && <p className="text-body-sm text-destructive">该字段名已存在。</p>}
        {/* enum fields need their values, and the server refuses the whole set
            without them - say so here rather than letting the save 422. */}
        {draft.some((f) => f.valueType === "enum" && !f.enumValues?.length) && (
          <p className="text-body-sm text-muted-foreground">
            enum 字段的取值集合尚未开放编辑，保存时会被服务端拒绝——先用 string 代替。
          </p>
        )}

        <div className="flex items-center gap-sm">
          <Button variant="default" disabled={busy || !dirty || over} onClick={() => onSave(draft)}>
            保存字段
          </Button>
          {dirty && (
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(fields)}>
              放弃更改
            </Button>
          )}
          {/* The write is whole-set (delete+insert), so a partial save is not a
              thing that can happen - and the user should know that before they
              press it. */}
          <span className="text-body-sm text-muted-foreground">保存会整体替换该库的字段声明。</span>
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
      setErr("间隔需为正整数天数；留空表示只验一次。");
      return;
    }
    setErr(null);
    void onVerifierConfig(verifier.trim() || null, days);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-md">
        <div>
          <CardTitle>验证治理</CardTitle>
          <CardDescription>
            {kb.governanceEnabled
              ? `已开启。${formatInterval(kb.defaultVerifyIntervalDays)}续验。`
              : "关闭——内容不纳入验证跟踪（默认）。"}
          </CardDescription>
        </div>
        <Switch
          checked={kb.governanceEnabled}
          disabled={busy}
          onCheckedChange={(v) => onGovernance(v)}
          aria-label="验证治理开关"
        />
      </CardHeader>
      {kb.governanceEnabled && (
        <CardContent className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-end gap-md">
            <label className="flex flex-col gap-xs text-body-sm">
              <span className="text-muted-foreground">默认验证人（用户 id）</span>
              <Input
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                placeholder="usr_…（留空则仅管理员）"
                aria-label="默认验证人"
                className="w-[20rem] max-w-full"
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-xs text-body-sm">
              <span className="text-muted-foreground">续验间隔（天）</span>
              <Input
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                placeholder="留空 = 只验一次"
                inputMode="numeric"
                aria-label="续验间隔（天）"
                className="w-[10rem]"
                disabled={busy}
              />
            </label>
            <Button disabled={busy} onClick={save}>
              保存
            </Button>
          </div>
          {err && <p className="text-body-sm text-destructive">{err}</p>}
          <p className="text-body-sm text-muted-foreground">
            指定的验证人（或管理员）可以验证文档。验证过的文档在间隔到期后转为「过期」，退出默认检索档，直到重新验证。
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
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>目录</CardTitle>
        <CardDescription>
          库内单层目录，只做整理，不带权限语义（权限在库这一级）。删除目录不会丢文档——它们变成「未归档」。
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
                  aria-label={`重命名 ${f.name}`}
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
                  保存
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  取消
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
                  重命名
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(f)}>
                  删除
                </Button>
              </>
            )}
          </div>
        ))}

        <div className="flex items-center gap-sm pt-xs">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新目录名"
            aria-label="新目录名"
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
            新建目录
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  SegmentedControl,
  Textarea,
} from "@vxture/design-system";
import {
  createKb,
  listProcessingTemplates,
  loginHref,
  ApiError,
  type SourceMode,
  type ProcessingTemplateOption,
} from "../../../_lib/api";
import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { useFormat, type Failure } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { shell } from "../../../_i18n/messages/shell";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";

// 新建知识库 —— 纯流程页,按 150 §3.1 的流程页契约:标题是动作名,描述说做完会
// 发生什么,页头唯一的动作是**取消**,表单唯一的主动作是**创建**。
//
// 此前这一页是 DS 之前的本地样式套件,而且**同时还在列库**——与 /assets 重复,
// 150 §3.3 早把它记在案上(「真正的问题是这一页到底该不该是纯新建流程」)。答案
// 是该:列表是 /assets 的职责,这里留着一份就是第二个会漂的清单(KD-223)。
//
// 表单问四件事,顺序即重要度:
//
//   名称        必填——没有名字没有库;
//   来源模式    建库时就要选(KD-218):它决定这个库的页面长什么样。语义与治理
//               默认写在选择器旁边,与设置页同一组句子——同一件事换页面不换说法;
//   描述        可选;
//   加工模板    可选,默认通用;之后可在设置里换,所以这里只有一句话的提示。
//
// 创建成功后**直接进入新库**,不回列表:下一步动作(上传、接源)全在那里,回列表
// 等于让人再点一次刚创建的东西。
export function NewAssetClient() {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const sh = useMessages(shell);
  const router = useRouter();

  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("owned");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<ProcessingTemplateOption[]>([]);
  const [creating, setCreating] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await listProcessingTemplates());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      // 模板目录取不到不拦创建:模板是可选项,默认通用永远可用。失败在这里只意味
      // 着下拉里少了几档,不值得为它挡住整个流程。
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const kb = await createKb({
        name: trimmed,
        description: description.trim() || undefined,
        sourceMode,
        processingTemplateId: templateId || null,
      });
      router.push(`/assets/${kb.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return setNeedsAuth(true);
      setError({ cause: err, fb: assets.errCreate });
      setCreating(false);
    }
    // 成功路径不清 creating:页面即将离开,按钮保持「创建中…」直到导航完成——
    // 恢复成可点状态只会招来第二次提交。
  }

  if (needsAuth) return <SignInGate from={"/assets/new"} />;

  return (
    <>
      <PageHead
        title={sh.newAsset}
        description={m.createFlowDesc}
        actions={
          <Button variant="outline" asChild>
            <Link href="/assets">{c.cancel}</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}

      <Card className="max-w-[46rem]">
        <CardContent className="py-lg">
          <form onSubmit={onCreate} className="flex flex-col gap-lg">
            <Field>
              <FieldLabel htmlFor="kb-name">{m.createNameLabel}</FieldLabel>
              <Input
                id="kb-name"
                value={name}
                maxLength={255}
                placeholder={m.createNamePlaceholder}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>{m.modeCardTitle}</FieldLabel>
              {/* 与设置页同一组句子(modeOwnedDesc / modeSyncedDesc / modeHint):
                  同一件事换页面不换说法,两处漂开就是两套定义。 */}
              <SegmentedControl
                items={[
                  { value: "owned", label: m.modeOwned },
                  { value: "synced", label: m.modeSynced },
                ]}
                value={sourceMode}
                onChange={(v) => setSourceMode(v as SourceMode)}
                fill
                ariaLabel={m.modeCardTitle}
              />
              <FieldDescription>
                {sourceMode === "synced" ? m.modeSyncedDesc : m.modeOwnedDesc} {m.modeHint}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="kb-desc">{m.createDescLabel}</FieldLabel>
              <Textarea
                id="kb-desc"
                value={description}
                placeholder={m.createDescPlaceholder}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={creating}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="kb-template">{m.templateCardTitle}</FieldLabel>
              {/* 与设置页的模板选择器**同一副形状**:「默认(通用)」是自己的一行
                  (value=""),目录行 id 为 null 表示离线不可选——不是默认档。同一个
                  控件两处长得不一样,人会以为是两个东西。 */}
              <NativeSelect
                id="kb-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                wrapperClassName="w-[20rem] max-w-full"
                disabled={creating}
              >
                <option value="">{m.templateDefault}</option>
                {templates.map((t) => (
                  <option key={t.templateCode} value={t.id ?? ""} disabled={t.id === null}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>{m.createTemplateHint}</FieldDescription>
            </Field>

            <div className="flex items-center gap-sm">
              <Button type="submit" variant="default" disabled={!name.trim() || creating}>
                {creating ? m.createPending : m.createGo}
              </Button>
              <span className="text-body-sm text-muted-foreground">{m.createHint}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

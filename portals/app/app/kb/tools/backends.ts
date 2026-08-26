// The one place tool backends are assembled (shared by the S2S tool route and
// the Runos MCP channel, 230-runos-channel). Both channels front the SAME
// knowledge service - the owner's product definition makes that a design rule
// ("Agent Runtime 直接调用 Karda / 通过 Runos Resource 暴露给 Agent, 二者底层
// 仍然是同一个 Karda Knowledge Service") - so the assembly must not fork per
// channel; only authentication and gating differ, and those live in each route.
import { dispatchTool, type ToolBackends, type DispatchResult } from "./dispatch";
import type { CallerContext } from "./s2s";
import { KbService } from "../lib/service";
import { getKbStore } from "../lib/store";
import { ContentService } from "../lib/content-service";
import { getContentStore } from "../lib/content-store";
import { getObjectStore } from "../storage/objectstore";
import { getProcessingRuntime } from "../processing/runtime";
import { getTemplateResolver } from "../lib/template-resolver";
import { getAttachmentStore } from "../attachments/store";
import { getRecallCorpus, getRecallTextResolver } from "../retrieval/corpus";
import { getVisibleSetResolver } from "../retrieval/visible-set";
import { getGenerationClient, askModelSelection } from "../retrieval/generation";
import { searchTool } from "../retrieval/search-tool";
import { askTool } from "../retrieval/ask-tool";
import { readEvidence } from "../assertions/evidence-store";
import { evidenceNotFound } from "../assertions/evidence-read";
import { writeDocument } from "./write";
import { createEntry } from "./entry";
import { createKb, attachKb, detachKb } from "../attachments/tools";

export function buildToolBackends(): ToolBackends {
  const kb = new KbService(getKbStore());
  const content = new ContentService(getContentStore());
  const objects = getObjectStore();
  const runtime = getProcessingRuntime();
  const generation = getGenerationClient();
  return {
    async listKbs(workspaceId) {
      return kb.list(workspaceId);
    },
    // write_document is wired (TD-009 9a): capture a document and enqueue it on
    // the shared runtime queue (the same one POST /api/kb/processing/tick drains).
    writeDocument: (caller, args) => writeDocument(caller, args, { kb, content, objects, queue: runtime.queue }),
    // create_entry is wired (TD-009 9b): write a template-shaped draft entry. The
    // resolver bridges the template code the caller passes -> the seeded row id.
    createEntry: (caller, args) => createEntry(caller, args, { kb, content, templates: getTemplateResolver() }),
    // create_kb / attach_kb / detach_kb are wired (TD-009 9b): the attachment
    // store keys (workspace, user, calling-product) -> kb. create_kb also makes
    // the library; attach/detach only touch the list.
    createKb: (caller, args) => createKb(caller, args, { kb, attachments: getAttachmentStore() }),
    attachKb: (caller, args) => attachKb(caller, args, { kb, attachments: getAttachmentStore() }),
    detachKb: (caller, args) => detachKb(caller, args, { kb, attachments: getAttachmentStore() }),
    // search is wired (TD-008): scope (visible-set INTERSECT attachment, plus
    // explicitly-merged preset ids - product_110 D5) + dual-path recall +
    // rerank-degrade.
    search: (caller, args) =>
      searchTool(caller, args, {
        visibleSet: getVisibleSetResolver(getKbStore()),
        attachments: getAttachmentStore(),
        corpus: getRecallCorpus(),
        // enables the real reranker (A3) when ATLAS_RERANK_* is configured;
        // vector recall (A1) wires in via the same per-request atlas wiring.
        textResolver: getRecallTextResolver(),
      }),
    // ask is wired only when the Atlas A4 client is configured (ATLAS_BASE_URL +
    // OIDC creds to mint the aud=atlas bearer, getGenerationClient); otherwise it
    // is left out and dispatch returns not_implemented rather than failing at call
    // time. Model selection (KD-109): auto-adapt via ATLAS_ASK_TASK_PROFILE, else a
    // pinned ATLAS_ASK_MODEL - askModelSelection emits exactly one.
    ...(generation
      ? {
          // get_evidence reuses the SAME visible-set rule as retrieval rather
          // than checking access its own way: a provenance tool that computed
          // visibility differently from the tool that produced the citation
          // would eventually disagree with it, and the disagreement would only
          // ever show up as a leak.
          getEvidence: async (caller, citationId) => {
            const ws = caller.workspace;
            if (!ws) return evidenceNotFound(citationId);
            const visible = await getVisibleSetResolver(getKbStore()).resolve({
              org: caller.org,
              ws,
              product: caller.callerProduct,
              user: caller.user,
            });
            return readEvidence(citationId, visible.map((v) => v.kbId));
          },
          ask: (caller, args) =>
            askTool(caller, args, {
              visibleSet: getVisibleSetResolver(getKbStore()),
              attachments: getAttachmentStore(),
              corpus: getRecallCorpus(),
              textResolver: getRecallTextResolver(),
              generation,
              ...askModelSelection(),
            }),
        }
      : {}),
  };
}

export { dispatchTool };
export type { ToolBackends, DispatchResult, CallerContext };

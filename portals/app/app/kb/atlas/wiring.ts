// Atlas /v1 wiring: the one place env config becomes live clients. Mirrors the
// getGenerationClient() posture (generation.ts): a capability whose config is
// absent yields null, so its surface stays honestly degraded/not_implemented
// instead of failing at call time.
//
// Config keys (all in .env.example):
//   ATLAS_BASE_URL           - shared base for every /v1 capability
//   ATLAS_EMBED_MODEL        - default embedding modelCode (KB.embedding_model overrides)
//   ATLAS_EMBED_PATH         - default /v1/embed
//   ATLAS_RERANK_MODEL / ATLAS_RERANK_TASK_PROFILE - rerank selection (one of)
//   ATLAS_RERANK_PATH        - default /v1/rerank
import { getAtlasTokenSource } from "../retrieval/atlas-token";
import type { Recaller, Reranker } from "../retrieval/search";
import { VectorRecaller } from "../retrieval/vector-recaller";
import { getVectorCorpus } from "../retrieval/vector-corpus";
import type { RecallTextResolver } from "../retrieval/corpus";
import type { AtlasClientCore, AtlasContext } from "./client";
import { AtlasEmbedClient } from "./embed";
import { AtlasReranker, rerankSelection } from "./rerank";

/** The shared /v1 core, or null when Atlas is not configured. */
export function getAtlasCore(): AtlasClientCore | null {
  const baseUrl = process.env.ATLAS_BASE_URL;
  const tokenSource = getAtlasTokenSource();
  if (!baseUrl || !tokenSource) return null;
  return { baseUrl, tokenSource };
}

/** The workspace-default embedding model lock (KB.embedding_model overrides per
 *  library at processing time; retrieval queries use this default). */
export function defaultEmbedModel(): string | null {
  return process.env.ATLAS_EMBED_MODEL || null;
}

export interface RetrievalAtlasDeps {
  /** resolves candidate ids to text for the cross-encoder. */
  texts: RecallTextResolver;
}

export interface RetrievalAtlas {
  /** the second recaller (vector), when A1 is configured. */
  vectorRecaller: Recaller | null;
  /** the real reranker, when A3 is configured. */
  reranker: Reranker | null;
}

/**
 * Build the per-request retrieval-side Atlas pieces for an authenticated
 * caller. Both are optional independently: embed configured but rerank not
 * (or vice versa) wires only the half that exists; the chain degrades the rest.
 */
export function retrievalAtlas(
  ctx: AtlasContext,
  taskId: string,
  deps: RetrievalAtlasDeps,
): RetrievalAtlas {
  const core = getAtlasCore();
  if (!core) return { vectorRecaller: null, reranker: null };
  const context = () => Promise.resolve(ctx);

  const embedModel = defaultEmbedModel();
  const vectorRecaller = embedModel
    ? new VectorRecaller(getVectorCorpus(), new AtlasEmbedClient(core, { context, taskId }), embedModel)
    : null;

  const selection = rerankSelection();
  const reranker = selection
    ? new AtlasReranker(
        core,
        { context, taskId },
        {
          async resolve(ids) {
            return (await deps.texts.resolve(ids)).map((t) => ({ id: t.id, text: t.text }));
          },
        },
        selection,
      )
    : null;

  return { vectorRecaller, reranker };
}

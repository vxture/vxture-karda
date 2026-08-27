// Atlas /v1 wiring: the one place deployment config becomes live clients. The
// only activation switch is ATLAS_BASE_URL + OIDC creds (the shared core);
// WHICH models serve each capability is not configured here at all - selection
// is grant-driven (KD-018, kb/atlas/selection.ts): karda sends its fixed task
// profiles and Atlas resolves models from the tenant's grants. A capability
// with no matching grant fails at call time with ENDPOINT_NOT_ROUTABLE,
// which every consumer maps to its designed degrade (embed parks, vector
// recall self-degrades to [], rerank falls back to RRF order).
import { getAtlasTokenSource } from "../retrieval/atlas-token";
import type { Recaller, Reranker } from "../retrieval/search";
import { VectorRecaller } from "../retrieval/vector-recaller";
import { getVectorCorpus } from "../retrieval/vector-corpus";
import type { RecallTextResolver } from "../retrieval/corpus";
import type { AtlasClientCore, AtlasContext } from "./client";
import { AtlasEmbedClient } from "./embed";
import { AtlasReranker } from "./rerank";
import { rerankSelection } from "./selection";

/** The shared /v1 core, or null when Atlas is not configured. */
export function getAtlasCore(): AtlasClientCore | null {
  const baseUrl = process.env.ATLAS_BASE_URL;
  const tokenSource = getAtlasTokenSource();
  if (!baseUrl || !tokenSource) return null;
  return { baseUrl, tokenSource };
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

  // Both pieces wire whenever the core exists - no per-capability model config
  // (KD-018). A missing grant degrades at call time, it does not unconfigure.
  const vectorRecaller = new VectorRecaller(getVectorCorpus(), new AtlasEmbedClient(core, { context, taskId }));

  const reranker = new AtlasReranker(
    core,
    { context, taskId },
    {
      async resolve(ids) {
        return (await deps.texts.resolve(ids)).map((t) => ({ id: t.id, text: t.text }));
      },
    },
    rerankSelection(),
  );

  return { vectorRecaller, reranker };
}

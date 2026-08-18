// Grant-driven model selection (KD-018; owner ruling 2026-08-19). Atlas #42
// states the principle in Atlas's own words: "karda's business code shouldn't
// hardcode a specific modelCode - doing so defeats the point of routing
// through Atlas." So karda does not configure models per capability. It sends
// a FIXED task-profile label per capability; which concrete model serves it is
// decided ENTIRELY by Atlas-side authorization (the highest-priority active
// grant whose model_grants.task_profile matches, 404 TASK_PROFILE_NOT_ROUTABLE
// on no match - never a silent default). Changing vendor, price, or rolling a
// migration is an Atlas grant edit, zero karda changes.
//
// The three labels below ARE karda's side of that contract - the operator
// labels karda's tenant grants with exactly these strings. Product-prefixed so
// they can never collide with another product's labels in a shared tenant.
//
// Env pins (ATLAS_ASK_MODEL / ATLAS_EMBED_MODEL / ATLAS_RERANK_MODEL and the
// *_TASK_PROFILE overrides) remain readable as BREAK-GLASS only - explicitly
// set beats the default profile; unset (the normal state) routes by grant.

export const KARDA_TASK_PROFILES = {
  ask: "karda.ask",
  embed: "karda.embed",
  rerank: "karda.rerank",
} as const;

export interface ModelSelection {
  modelCode?: string;
  taskProfile?: string;
}

function select(profileEnv: string | undefined, modelEnv: string | undefined, defaultProfile: string): ModelSelection {
  if (profileEnv) return { taskProfile: profileEnv };
  if (modelEnv) return { modelCode: modelEnv };
  return { taskProfile: defaultProfile };
}

/** karda.ask generation (A4). */
export function askSelection(): ModelSelection {
  return select(process.env.ATLAS_ASK_TASK_PROFILE, process.env.ATLAS_ASK_MODEL, KARDA_TASK_PROFILES.ask);
}

/** Embedding (A1). `kbPin` is the optional library-level lock
 *  (KB.embedding_model) and beats everything - a pinned library never drifts
 *  vector space, which is the KD-107 guarantee the pin exists for. */
export function embedSelection(kbPin?: string | null): ModelSelection {
  if (kbPin) return { modelCode: kbPin };
  return select(process.env.ATLAS_EMBED_TASK_PROFILE, process.env.ATLAS_EMBED_MODEL, KARDA_TASK_PROFILES.embed);
}

/** Rerank (A3). */
export function rerankSelection(): ModelSelection {
  return select(process.env.ATLAS_RERANK_TASK_PROFILE, process.env.ATLAS_RERANK_MODEL, KARDA_TASK_PROFILES.rerank);
}

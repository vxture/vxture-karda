import type { states } from "./messages/states";

// Which message an API failure maps to.
//
// This is STRUCTURE, not language - the same reasoning that kept tones in
// `_lib/format.ts`. A 409 with `binding_exists` earns its own sentence in every
// locale or in none; that judgement is made once, here, and the locales only
// supply the words. Keeping it in the hook body would have made it untestable
// without a renderer, for no gain.

export type ErrKey = Extract<keyof typeof states, `err${string}`>;

export interface ApiErrorMapping {
  key: ErrKey;
  /**
   * Append the raw code in parentheses. True only for the last-resort branch:
   * an unmapped code is something to go and map, and hiding it behind a
   * friendly generic is how it stays unmapped.
   */
  withCode: boolean;
}

export function apiErrorKey(status: number, code?: string): ApiErrorMapping {
  const at = (key: ErrKey): ApiErrorMapping => ({ key, withCode: false });

  if (status === 401) return at("errSessionExpired");
  if (status === 403) return at(code === "forbidden" ? "errForbidden" : "errRefused");
  if (status === 404) return at("errNotFound");
  if (status === 409) {
    if (code === "duplicate_document") return at("errDuplicateDocument");
    if (code === "name_taken") return at("errNameTaken");
    if (code === "binding_exists") return at("errBindingExists");
    return at("errConflict");
  }
  if (code === "illegal_transition") return at("errIllegalTransition");
  if (code === "unknown_connector") return at("errUnknownConnector");
  if (code === "name_required") return at("errNameRequired");
  if (status >= 500) return at("errServer");
  return { key: "errRefused", withCode: code != null };
}

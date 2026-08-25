import type { Catalog } from "../catalog";

// The bench (试问台). Only the failure wording is here so far - the rest of the
// surface is swept with its own domain; see `docs/00-meta/30-i18n.md`.
export const bench = {
  errLoadKbs: { "zh-CN": "库列表加载失败。", "en-US": "Could not load the library list." },
  errQuery: { "zh-CN": "查询失败。", "en-US": "The query failed." },
} satisfies Catalog;

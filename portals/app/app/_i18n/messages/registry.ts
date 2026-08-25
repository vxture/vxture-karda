import type { Catalog } from "../catalog";
import { shell } from "./shell";
import { common } from "./common";
import { states } from "./states";
import { assets } from "./assets";
import { bench } from "./bench";
import { evaluation } from "./evaluation";

/**
 * Every namespace, in one place.
 *
 * The catalog tests used to spell their own list, three times over, and a
 * namespace added afterwards was simply never checked - it compiled, it
 * rendered, and nothing pinned its pairs. Enumerating here means a new
 * namespace is covered the moment it is imported, and the i18n guard has one
 * authority for what "the catalog" is.
 */
export const NAMESPACES = { shell, common, states, assets, bench, evaluation } satisfies Record<string, Catalog>;

export type NamespaceName = keyof typeof NAMESPACES;

import {visualMessages} from './visual';
import type { Catalog } from "../catalog";
import {integration} from "./integration";
import { shell } from "./shell";
import { common } from "./common";
import { states } from "./states";
import { assets } from "./assets";
import { evaluation } from "./evaluation";
import { channels } from "./channels";
import { home } from "./home";
import { pipeline } from "./pipeline";
import { semantic } from "./semantic";

/**
 * Every namespace, in one place.
 *
 * The catalog tests used to spell their own list, three times over, and a
 * namespace added afterwards was simply never checked - it compiled, it
 * rendered, and nothing pinned its pairs. Enumerating here means a new
 * namespace is covered the moment it is imported, and the i18n guard has one
 * authority for what "the catalog" is.
 */
export const NAMESPACES = { visualMessages, integration, shell, common, states, assets, evaluation, channels, pipeline, home, semantic } satisfies Record<string, Catalog>;

export type NamespaceName = keyof typeof NAMESPACES;

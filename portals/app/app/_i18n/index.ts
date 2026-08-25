import type { Locale } from "@vxture/shared";
import type { Message, MessageFn } from "./catalog";

export type { Message, MessageFn } from "./catalog";
export { t } from "./catalog";

// The message namespaces. One per product domain, mirroring the nav domains, so
// a string's home is obvious from where it renders and a domain sweep is a
// single file rather than a grep.
export { shell } from "./messages/shell";
export { common } from "./messages/common";

/**
 * Pick a locale's half of a message table, once, for a whole component.
 *
 * The alternative - calling `t(msg, locale)` per string - puts the locale on
 * every line and makes the JSX read as plumbing. This keeps the call sites as
 * `m.save` while the locale is bound exactly once, at the top of the component.
 */
export type Resolved<T> = {
  [K in keyof T]: T[K] extends Message
    ? string
    : T[K] extends MessageFn<infer A>
      ? (...args: A) => string
      : never;
};

export function resolve<T extends Record<string, Message | MessageFn<never>>>(
  table: T,
  locale: Locale,
): Resolved<T> {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(table)) {
    // A MessageFn's per-locale entry IS the function; a Message's is the string.
    // One indexing rule covers both, which is why they share a shape.
    out[key] = (table[key] as Record<Locale, unknown>)[locale];
  }
  return out as Resolved<T>;
}

"use client";

import { useMemo } from "react";
import type { Message, MessageFn } from "./catalog";
import { resolve, type Resolved } from "./index";
import { useLocale } from "../_shell/locale";

/**
 * Bind a message namespace to the current locale, once per component.
 *
 * Usage is `const m = useMessages(shell)` then `m.navAssets` - the locale is
 * named exactly once, at the top, and the JSX below reads as content rather
 * than as plumbing. That matters more than it sounds: a `t(msg, locale)` on
 * every line is what makes teams stop adding strings to the catalog and start
 * hardcoding them again.
 *
 * The locale comes from the shell's LocaleProvider, which already persists the
 * preference and stamps `<html lang>`. That seam was built in the shell work
 * with this layer explicitly in mind ("a future string-catalog layer can consume
 * it without a storage migration") - this is that layer.
 */
export function useMessages<T extends Record<string, Message | MessageFn<never>>>(table: T): Resolved<T> {
  const { locale } = useLocale();
  // Memoised on the table identity and the locale: namespaces are module
  // constants, so this recomputes only when the language actually changes.
  return useMemo(() => resolve(table, locale), [table, locale]);
}

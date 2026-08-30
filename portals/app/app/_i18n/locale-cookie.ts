import type { Locale } from "@vxture/shared";

// The locale preference's SHARED half: the cookie name and the narrowing guard.
// Isomorphic on purpose - the client provider (locale.tsx) writes the cookie and
// the server reader (server-locale.ts) reads it, and the two must agree on both
// the name and the value domain. next/headers must NOT be imported here: this
// file is also bundled client-side.
export const LOCALE_COOKIE = "karda-locale";

/** Narrow an untrusted string to a supported Locale. */
export function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

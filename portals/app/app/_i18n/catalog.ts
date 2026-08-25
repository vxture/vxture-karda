import type { Locale } from "@vxture/shared";

// karda's string catalog.
//
// WHY THE APP OWNS THIS AT ALL. `@vxture/design-system` 8.0.0 changed every
// component's default copy to English and states the rule plainly: the English
// value is a FALLBACK, not a product language - "英文默认值出现在生产界面上,说明
// 有人忘了传". DS deliberately has no locale context and will not acquire one;
// translation happens at the call site. So the call site needs somewhere to
// translate from, and this is it.
//
// THE SHAPE, AND WHY:
//
//   messages = { [key]: { "zh-CN": string, "en-US": string } }
//
// Keyed first, locale second - NOT one file per locale. A per-locale file lets
// the two drift: you add a key to zh and forget en, and nothing tells you,
// because a missing key is only a runtime blank. Keeping both languages on the
// same line makes an untranslated key impossible to write without seeing it,
// and makes review a diff of pairs rather than of two files that must be read
// together.
//
// EXTENSIBILITY is the platform's job, not karda's. `Locale` comes from
// `@vxture/shared` and is the whole platform's single list. When it widens,
// `Messages` below fails to compile everywhere a pair is short a language -
// which is exactly the prompt a new locale should produce. karda must never
// declare its own locale union; a product-local list is how two products end up
// disagreeing about what "en" means.

/** Every message carries all supported locales. Adding a locale to the platform
 *  type turns every incomplete entry into a compile error - deliberately. */
export type Message = Record<Locale, string>;

/**
 * A message that takes runtime values.
 *
 * Interpolation is a FUNCTION per locale rather than a template with `{name}`
 * placeholders, because word order is not shared between languages: Chinese
 * puts the quantifier where English puts the noun, and a single template string
 * forces one language's grammar onto the other. DS hit exactly this and had to
 * hand `titleTemplate` back to the caller (7.1.0); a function sidesteps the
 * problem instead of relocating it.
 */
export type MessageFn<A extends unknown[]> = Record<Locale, (...args: A) => string>;

export type Catalog = Record<string, Message | MessageFn<never>>;

/**
 * Resolve a message for a locale.
 *
 * There is no fallback chain and no "missing key" placeholder: `Message` is a
 * total record over `Locale`, so a missing translation cannot reach here - it
 * fails to compile. A runtime fallback would only hide that.
 */
export function t(m: Message, locale: Locale): string {
  return m[locale];
}

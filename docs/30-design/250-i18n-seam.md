# 250 - The i18n seam: where language lives

Status: implemented (zh-CN / en-US) for the shell header, the state vocabulary
and the assets domain. Remaining domains sweep one PR at a time.

karda is Chinese-first (owner naming ruling 2026-08-21). This document is about
where the *other* languages come from, and - more importantly - which parts of
the product are not language at all.

## 1. Why the app owns a catalog

`@vxture/design-system` 8.0.0 changed every component's default copy to English
and states the rule plainly: the English value is a **fallback**, not a product
language. DS deliberately has no locale context and will not acquire one, so
translation happens at the call site. A call site needs somewhere to translate
from; that is `portals/app/app/_i18n/`.

## 2. The shape, and the one rule that makes it hold

```
messages = { [key]: { "zh-CN": string, "en-US": string } }
```

Keyed message-first, **not** one file per locale. A per-locale file lets the two
halves drift: a key added to `zh` and forgotten in `en` is only a runtime blank.
Keeping both languages on one line makes an untranslated key impossible to write
without seeing it, and makes review a diff of pairs.

Extensibility is the platform's job. `Locale` comes from `@vxture/shared` and is
the whole platform's single list; when it widens, every incomplete pair stops
compiling. karda must never declare its own locale union.

Interpolation is a **function per locale**, not a template with `{name}`
placeholders, because word order is not shared between languages - and neither
is punctuation. Chinese brackets a name with `「」` and enumerates with `、`;
English uses quotes and commas. A shared template forces one language's grammar
onto the other. DS hit this and had to hand `titleTemplate` back to the caller
(7.1.0); a function sidesteps it.

## 3. The split that does most of the work: structure vs language

The recurring judgement is not "which words" but **which half of a thing is
language at all**. Three times over, the same cut paid:

| Module | Stayed (structure) | Moved (language) |
| --- | --- | --- |
| `_lib/format.ts` | tone per state, publish-ladder order, byte maths | every label |
| `kb/governance/record.ts` | which of seven clock readings applies, the day count | the phrase |
| `kb/connectors/catalog.ts` | which degradations a capability set implies | the warning sentence |
| `_shell/nav.ts` | the four domains, their hrefs, icons and sub-views | every label and description |
| `_lib/session.ts` | which rung of the role ladder a session holds | the rung's name |
| `useFormat().compact` | the "show exact below 10,000" threshold | the abbreviation above it |

A tone is a fact about a state - `failed` is bad, `indexed` is ok - and does not
vary by language. Leaving it in the catalog would mean maintaining the same
judgement once per locale with nothing checking that the copies agreed. The
connector case was the sharpest: the degradation warnings were built as English
prose **on the server** and shipped down the wire, so a Chinese operator read the
most safety-critical text in the product in the wrong language and no amount of
client work could fix it.

The general form: **codes on the wire, prose at the call site.** A route answers
`{"error":"not_found"}`; the client renders the sentence. Translating the product
never means touching an API contract.

## 4. Errors are data until they are rendered

The obvious shape - `setError(f.apiError(e.status, e.code))` - formats at catch
time, and the string is then stuck in whatever locale was active when the request
failed. Worse, it drags the locale into every `useCallback` that can fail, so
either the deps list grows (and switching language refetches the page) or the
callback quietly closes over a stale formatter. Both happened here before the
shape changed.

State holds the cause; `useFormat().failure()` renders it:

```ts
const [error, setError] = useState<Failure | null>(null);
// ...
catch (e) { setError({ cause: e, fb: assets.errLoadDocs }); }
// ...
{error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
```

`Failure.fb` takes an **unresolved pair** (`assets.errLoadDocs`, a module
constant), never a finished sentence. That is what keeps the callback free of
the locale entirely - and it is why a namespace sometimes exists ahead of its
domain's sweep: every catch site in the app needs a catalog entry even when its
own surface is still hardcoded.

### 3.1 Two special cases the shell sweep turned up

**Words that were in two places at once.** The nav labels existed BOTH in
`nav.ts` (Chinese literals) and in the shell catalog - #136 added the catalog
half for the header and left the old half in place. Nothing checked the two
agreed, and nothing rendered the catalog half, so in `en-US` the entire
navigation stayed Chinese while the header's search palette was English. The
same shape appeared in the role ladder, computed once in the header and once in
the scope panel, one reading the catalog and one hardcoding Chinese.

The fix in both cases is one source plus a compile-time binding: each nav item
declares `labelKey`/`descKey` (typed `keyof typeof shell`), so a new domain
cannot ship without a label. The binding is a FIELD ON THE ITEM rather than a
side table, because a side table keyed by `domain.sub` stopped type-checking -
TypeScript cannot see that the `s` in `item.sub.map(s => ...)` came from THAT
item, so the composite key widened to the full cross-product.

**Numbers are language too.** `1204 -> 1,204; 12040 -> 1.2万` was hand-rolled
and produced 万 for every locale. The cut points differ, not just the suffix:
Chinese groups by 10^4, English by 10^3/10^6. `Intl.NumberFormat(locale,
{ notation: "compact" })` already knows both. What stayed in code is the
threshold below which the exact number is more useful than an abbreviation -
that is a display choice, not a language.

---

## 5. What is checked, and what cannot be

- `catalog.test.ts` - every message carries every locale; no pair is an
  untranslated copy of the other half; the English half contains no CJK; the
  Chinese half is not an unwritten English sentence. Interpolated messages are
  **probed** with declared arguments: an earlier version skipped anything that
  was not a string, so a `MessageFn` returning Chinese from its English half
  passed every check. A function with no `PROBES` entry now fails the suite.
- `messages/registry.ts` - one authority for what "the catalog" is. The tests
  used to spell their own namespace list three times, and a namespace added
  afterwards was simply never checked.
- `scripts/guardrails/check-i18n-seam.mjs` - no CJK outside comments, inside a
  **swept scope**. The criterion is crude on purpose: a subtler check ("does this
  look like copy?") has judgement calls in it, and a guard with judgement calls
  is a guard people argue with.

The scope grows with the sweep. An unswept domain is not silently exempt - it is
visibly absent from `SCOPE`, and the entry that adds it is the same PR that
sweeps it. `EXEMPT` entries carry a written reason and are checked for
staleness, because a stale exemption is how a guard quietly stops guarding.

**What no text scan can catch** is the mirror failure: an English DS default
reaching a Chinese screen because nobody passed a label. Nothing in the source
is wrong in that case - a prop is simply absent. `catalog.test.ts` covers what it
can; the rest is a screenshot.

## 6. Known limit: server-rendered metadata

Locale is a client preference (`localStorage`, stamped onto `<html lang>` by the
shell's `LocaleProvider`). Next's `export const metadata` is produced on the
server, which cannot read it, so page titles stay Chinese in every locale. Fixing
it means a cookie-backed server locale - see **TD-014**. The two affected files
are `EXEMPT` in the guard, by name, with that reason.

## 7. Sweep order

Landed: the whole shell (`_shell`), the state vocabulary (`states`), and the
assets domain.
Remaining: 治理, 评测, 供给, 加工 - the `(portal)` pages for channels, pipeline,
evaluation, tools and bench. Each is one PR: translate the domain, add its
directory to `SCOPE`.

Note what a swept SHELL does not cover: `/api/shell`'s demo payload (steward
proposals, the alert line) stays Chinese, and correctly so - it stands in for
content the steward generates from the user's own documents, the same way a
library's name stays in the language its owner wrote it in. Chrome is
translated; content is not.

"use client";

import { useMemo } from "react";
import type { Locale } from "@vxture/shared";
import { useLocale } from "../_shell/locale";
import { useMessages } from "./useMessages";
import { states } from "./messages/states";
import { t, type Message } from "./catalog";
import { apiErrorKey } from "./apiError";
import { ApiError } from "../_lib/api";
import type { VerificationRecord } from "../kb/governance/record";
import {
  CONTENT_TONE,
  HEALTH_TONE,
  VERIFICATION_TONE,
  SHARING_TONE,
  type AssetHealth,
  type HealthMeta,
  type ContentState,
  type PublishState,
  type StateMeta,
  type SharingMeta,
  type Tone,
  type VerificationState,
} from "../_lib/format";

// The locale-bound half of `_lib/format.ts`.
//
// format.ts kept the parts that are STRUCTURE - which tone a state carries,
// what order the publish ladder goes in, how many bytes are in a KB. This file
// holds the parts that are nothing but LANGUAGE. The split matters because a
// tone is a fact about the state (failed is bad, indexed is ok) and does not
// vary between languages, so leaving it in the catalog would have meant
// maintaining the same judgement twice, once per locale, with nothing checking
// that the two agreed.
//
// Call sites barely move: `contentStateMeta(x)` becomes `f.content(x)` and the
// locale is named once, at the top of the component.

/**
 * A failure held as DATA, not as a finished sentence.
 *
 * The obvious shape - `setError(f.apiError(...))` - formats at catch time and
 * then the string is stuck: it was written in whatever locale was active when
 * the request failed, and it cannot follow a later language switch. Worse, it
 * drags the locale into every `useCallback` that can fail, so either the deps
 * list grows (and switching language refetches the page) or the callback
 * quietly closes over a stale formatter.
 *
 * Keeping the cause and formatting at render solves all three: the callback
 * stops depending on the locale, nothing refetches, and the message is written
 * fresh in the current language every time it is shown.
 */
export interface Failure {
  cause: unknown;
  /**
   * Wording for a cause that is not an `ApiError` - a dead network, a parse
   * failure. Names the operation, since the cause cannot.
   *
   * An UNRESOLVED pair, deliberately. Taking a finished string here would drag
   * the locale back into every `useCallback` that can fail - the exact bug this
   * type exists to remove - because the catch site would have to resolve it.
   * A namespace entry is a module constant, so a callback can name one without
   * depending on the language at all.
   */
  fb: Message;
}

export interface FormatHelpers {
  content(state: string): StateMeta;
  verification(state: string): StateMeta;
  /** An asset's overall health rung. */
  health(state: AssetHealth): HealthMeta;
  sharing(state: PublishState): SharingMeta;
  /** Human wording for an API failure. Codes stay on the wire; prose lives here. */
  apiError(status: number, code?: string): string;
  /**
   * A large count, abbreviated the way the reader's language abbreviates.
   *
   * Not a hand-rolled threshold: Chinese groups by 万 (10^4) and English by
   * K/M (10^3/10^6), so the CUT POINTS differ, not just the suffix. The old
   * `n >= 10000 ? (n/10000)+"万"` produced "1.2万" for every locale. Intl
   * already knows both systems.
   */
  compact(n: number): string;
  /** The verification clock as a sentence. null when there is nothing to say. */
  record(rec: VerificationRecord): string | null;
  /** Render a held failure. Pass-through null so call sites stay one line. */
  failure(err: Failure | null): string | null;
  /** null when the state has nothing to add beyond its badge. */
  processingHint(state: string): string | null;
  interval(days: number | null | undefined): string;
  when(iso: string | null | undefined): string;
}

export function useFormat(): FormatHelpers {
  const { locale } = useLocale();
  const m = useMessages(states);

  return useMemo<FormatHelpers>(() => {
    const contentLabel: Record<string, string> = {
      draft: m.contentDraft,
      processing: m.contentProcessing,
      indexed: m.contentIndexed,
      failed: m.contentFailed,
      archived: m.contentArchived,
      deleted: m.contentDeleted,
    };
    const verifLabel: Record<string, string> = {
      unverified: m.verifUnverified,
      verified: m.verifVerified,
      stale: m.verifStale,
    };
    const shareLabel: Record<PublishState, [string, string]> = {
      private: [m.sharePrivate, m.sharePrivateHelp],
      ws_published: [m.shareWorkspace, m.shareWorkspaceHelp],
      org_published: [m.shareOrg, m.shareOrgHelp],
    };

    return {
      content(state) {
        // An UNKNOWN state falls back to the raw value, not to a guess. A state
        // the client has never heard of is a deploy-skew signal, and rendering
        // it verbatim is what makes that visible instead of silently neutral.
        return { label: contentLabel[state] ?? state, tone: CONTENT_TONE[state as ContentState] ?? "muted" };
      },
      health(state) {
        const label: Record<AssetHealth, string> = {
          healthy: m.healthHealthy,
          attention: m.healthAttention,
          processing: m.healthProcessing,
          gap: m.healthGap,
        };
        return { label: label[state] ?? state, tone: HEALTH_TONE[state] ?? "neutral" };
      },
      verification(state) {
        return { label: verifLabel[state] ?? state, tone: VERIFICATION_TONE[state as VerificationState] ?? "muted" };
      },
      sharing(state) {
        const pair = shareLabel[state];
        if (!pair) return { label: String(state), tone: "muted" as Tone, help: "" };
        return { label: pair[0], tone: SHARING_TONE[state], help: pair[1] };
      },
      apiError(status, code) {
        const { key, withCode } = apiErrorKey(status, code);
        return withCode ? `${m[key]} (${code})` : m[key];
      },
      compact(n) {
        // Below the threshold the exact number is more useful than an
        // abbreviation ("1,204" beats "1.2K"), and the threshold itself is a
        // display choice that does not vary by language. What DOES vary is the
        // abbreviation above it, and that is Intl's job.
        if (n < 10_000) return new Intl.NumberFormat(locale as Locale).format(n);
        return new Intl.NumberFormat(locale as Locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(n);
      },
      record(rec) {
        // Day counts arrive signed - negative once expiry is behind us - and
        // the phrase already carries the direction, so the magnitude is what
        // the sentence needs.
        const d = Math.abs(rec.days ?? 0);
        switch (rec.phrase) {
          case null:
          case undefined:
            return null;
          case "lapsed":
            return m.recordLapsed;
          case "lapsedDays":
            return m.recordLapsedDays(d);
          case "noInterval":
            return m.recordNoInterval;
          case "overdueDays":
            return m.recordOverdueDays(d);
          case "dueToday":
            return m.recordDueToday;
          case "dueDays":
            return m.recordDueDays(d);
        }
      },
      failure(err) {
        if (!err) return null;
        const e = err.cause;
        if (!(e instanceof ApiError)) return t(err.fb, locale);
        const { key, withCode } = apiErrorKey(e.status, e.code);
        return withCode ? `${m[key]} (${e.code})` : m[key];
      },
      processingHint(state) {
        return state === "processing" ? m.processingHint : null;
      },
      interval(days) {
        // Was a locale branch written inline here, which is exactly the shape
        // the catalog exists to prevent: a product string in a source file,
        // invisible to the seam guard and to anyone translating.
        return days == null ? m.intervalOnce : m.intervalEvery(days);
      },
      when(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        // Intl does the locale work; the shape (numeric, 24h for zh) follows
        // what each locale's readers expect rather than one format for both.
        return new Intl.DateTimeFormat(locale as Locale, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: locale === "en-US",
        }).format(d);
      },
    };
  }, [m, locale]);
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@vxture/shared";
import { BRAND } from "@karda/shared/brand";
import { LOCALE_COOKIE, isLocale } from "../_i18n/locale-cookie";

// Minimal locale preference for the product shell. karda is Chinese-first
// (owner naming ruling 2026-08-21): the default locale is BRAND.defaultLocale
// (zh-CN) and shell copy is authored in Chinese. The preference is persisted
// and stamped onto <html lang>, so a future string-catalog layer can consume it
// without a storage migration; until that layer lands the switch only affects
// the document language attribute.
const STORAGE_KEY = "karda-locale";

/** 偏好的服务端副本(TD-014):generateMetadata 与根布局的 <html lang> 都读它。
 *  一年有效;SameSite=Lax——它只是一个显示偏好,跨站送不送无所谓,但没理由送。 */
function writeCookie(locale: Locale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
  } catch {
    // 拿不到 document.cookie(隐私模式的极端配置):标题退回默认语言,仅此而已。
  }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: BRAND.defaultLocale,
  setLocale: () => {},
});

/** Narrow an untrusted string to a supported Locale. Re-exported from the shared
 *  half so existing imports keep working; the definition moved next to the
 *  cookie name because server and client must agree on both (TD-014). */
export { isLocale } from "../_i18n/locale-cookie";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(BRAND.defaultLocale);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) {
        setLocaleState(saved);
        document.documentElement.lang = saved;
        // 迁移:老用户的偏好只在 localStorage 里,cookie 缺席则服务端标题永远是
        // 默认语言。补写一次,下一个请求起标题就跟上了(TD-014)。
        writeCookie(saved);
      }
    } catch {
      // Storage unavailable: stay on the default.
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
    writeCookie(next);
  }, []);

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

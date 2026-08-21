"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@vxture/shared";
import { BRAND } from "@karda/shared/brand";

// Minimal locale preference for the product shell. karda is Chinese-first
// (owner naming ruling 2026-08-21): the default locale is BRAND.defaultLocale
// (zh-CN) and shell copy is authored in Chinese. The preference is persisted
// and stamped onto <html lang>, so a future string-catalog layer can consume it
// without a storage migration; until that layer lands the switch only affects
// the document language attribute.
const STORAGE_KEY = "karda-locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: BRAND.defaultLocale,
  setLocale: () => {},
});

function isLocale(value: string | null): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(BRAND.defaultLocale);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) {
        setLocaleState(saved);
        document.documentElement.lang = saved;
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
  }, []);

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

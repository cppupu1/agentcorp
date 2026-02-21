import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { zh } from './zh';
import { en } from './en';

export type Locale = 'zh' | 'en';
export type TranslationKeys = keyof typeof zh;

const translations = { zh, en } as const;

function getInitialLocale(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKeys | (string & {}), params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const k = key as TranslationKeys;
    let text = translations[locale][k] || translations.zh[k] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

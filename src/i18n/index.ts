import { useCallback } from 'react'
import { create } from 'zustand'
import { en, zhHans, zhHant, type Dict } from './dict'

export type Locale = 'zh-Hans' | 'zh-Hant' | 'en'

/** Native names — never translated. */
export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: 'zh-Hant', label: '繁體中文', short: '繁' },
  { id: 'zh-Hans', label: '简体中文', short: '简' },
  { id: 'en', label: 'English', short: 'EN' },
]

const DICTS: Record<Locale, Dict> = { 'zh-Hans': zhHans, 'zh-Hant': zhHant, en }
const FALLBACK: Locale = 'zh-Hans'
const STORAGE_KEY = 'photo-editor.locale'

const isLocale = (v: unknown): v is Locale => v === 'zh-Hans' || v === 'zh-Hant' || v === 'en'

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* private mode / node */
  }
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const raw of langs) {
      const l = String(raw || '').toLowerCase()
      if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans'
      if (l.startsWith('en')) return 'en'
    }
  } catch {
    /* no navigator (node) */
  }
  return FALLBACK
}

export const useLocale = create<{ locale: Locale; setLocale: (l: Locale) => void; cycle: () => void }>(
  (set, get) => ({
    locale: detect(),
    setLocale: (locale) => {
      try {
        localStorage.setItem(STORAGE_KEY, locale)
      } catch {
        /* ignore */
      }
      set({ locale })
    },
    cycle: () => {
      const i = LOCALES.findIndex((l) => l.id === get().locale)
      get().setLocale(LOCALES[(i + 1) % LOCALES.length].id)
    },
  }),
)

export type Vars = Record<string, string | number>

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = DICTS[locale]?.[key] ?? DICTS[FALLBACK][key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Translate outside React, using the current locale. */
export function t(key: string, vars?: Vars): string {
  return translate(useLocale.getState().locale, key, vars)
}

/** Hook: re-renders when the locale changes. */
export function useT() {
  const locale = useLocale((s) => s.locale)
  return useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale])
}

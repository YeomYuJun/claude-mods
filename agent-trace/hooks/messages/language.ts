import { en } from './en.js'
import { ko } from './ko.js'
import type { Messages } from './types.js'

export type Language = 'en' | 'ko'

export const DEFAULT_LANGUAGE: Language = 'en'

export const MESSAGES: Readonly<Record<Language, Messages>> = { en, ko }

// settings 의 language 처럼 사람이 적은 이름(Korean, 한국어)과 LANG 값(ko_KR.UTF-8)을 앞부분으로 판정한다
export function languageOfText(text: unknown): Language | undefined {
  if (typeof text !== 'string') return undefined
  const value = text.trim().toLowerCase()
  if (/^(ko([_.@-]|$)|korean|한국)/.test(value)) return 'ko'
  if (/^(en([_.@-]|$)|english)/.test(value)) return 'en'
  return undefined
}

// userConfig 의 language 가 en·ko 면 그 값이다. auto 거나 비어 있으면 candidates(settings 의 language, LC_ALL, LANG 순)에서
// 처음 판정되는 값, 아무것도 판정되지 않으면 기본값이다
export function languageOf(option: unknown, candidates: readonly unknown[] = []): Language {
  if (option === 'en' || option === 'ko') return option
  for (const candidate of candidates) {
    const language = languageOfText(candidate)
    if (language) return language
  }
  return DEFAULT_LANGUAGE
}

export function messagesOf(language: Language): Messages {
  return MESSAGES[language]
}

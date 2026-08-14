/**
 * Failures, and the words for them. The store raises and records them without a
 * dictionary; this is where a code becomes a sentence, kept out of the component
 * so the choice of words is testable on its own.
 */
import { CodedError } from './api.ts'
import type { OperatingContextKey } from './locales.ts'

/** A failure the page still has to phrase. */
export interface HostFailure {
  code: string | undefined
  message: string
}

/**
 * Codes this plugin raises itself. They travel beside the host's own codes so
 * there is one place to look when choosing words.
 */
export const WRITE_BLOCKED = {
  readOnly: 'operating-context/read-only',
  noRoutes: 'operating-context/no-routes',
  invalidWindow: 'operating-context/invalid-window',
} as const

/**
 * Record any thrown value as a failure.
 * @param reason - whatever was caught.
 * @returns the failure, with a code when the thrower supplied one.
 */
export function failureOf(reason: unknown): HostFailure {
  if (reason instanceof CodedError) return { code: reason.code, message: reason.message }
  return { code: undefined, message: reason instanceof Error ? reason.message : String(reason) }
}

/**
 * Phrase a failed write. The codes worth naming are the ones a reader can act
 * on; anything else keeps the host's own words rather than guessing at them.
 * @param failure - the recorded failure.
 * @param t - the section's dictionary.
 * @returns the sentence to show.
 */
export function writeFailureText(
  failure: HostFailure,
  t: (key: OperatingContextKey) => string,
): string {
  if (failure.code === 'settings-conflict') return t('conflict')
  if (failure.code === WRITE_BLOCKED.readOnly) return t('readOnly')
  if (failure.code === WRITE_BLOCKED.noRoutes) return t('noRoutes')
  if (failure.code === WRITE_BLOCKED.invalidWindow) return t('customInvalid')
  return `${t('writeFailed')} ${failure.message}`
}

/**
 * The operating-window settings page: pick one window, see what it means for
 * each configured service, apply it everywhere.
 *
 * Page-wide facts live in the store; the only local state is the unsubmitted
 * choice, which nothing outside this component needs to read.
 */
import { useState, type ReactNode } from 'react'
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatCapacity, parseCapacity, WINDOW_PRESETS } from './capacity.ts'
import { outcomeOf, type RouteOutcome } from './ceiling.ts'
import { writeFailureText } from './failure.ts'
import { fill, type OperatingContextKey } from './locales.ts'
import { RouteRow } from './RouteRow.tsx'
import styles from './Section.module.css'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react'
import type { OperatingContextState, OperatingContextStore } from './store.ts'

/** Injected dependencies of {@link OperatingContextSection}. */
export interface OperatingContextInjected {
  controller: OperatingContextStore
  useSnapshot: SnapshotSelectorHook<OperatingContextState>
  t: (key: OperatingContextKey) => string
}

/** Props delivered by the slot outlet, which cannot promise the inject face. */
export type OperatingContextSectionProps = Partial<OperatingContextInjected>

/** The choice the user has made but not yet applied. */
interface Draft {
  /** Chosen preset, or `undefined` to follow whatever is already in force. */
  preset: number | undefined
  /** Whether the custom field is the active choice. */
  custom: boolean
  customText: string
}

const NO_DRAFT: Draft = { preset: undefined, custom: false, customText: '' }

/**
 * Render the operating-window section.
 * @param props - inject face from the client apply closure.
 * @returns the section, or nothing until the outlet supplies its dependencies.
 */
export function OperatingContextSection(props: OperatingContextSectionProps): ReactNode {
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  return <Loaded controller={controller} useSnapshot={useSnapshot} t={t} />
}

function Loaded({ controller, useSnapshot, t }: OperatingContextInjected): ReactNode {
  const state = useSnapshot(snapshot => snapshot)
  const [draft, setDraft] = useState<Draft>(NO_DRAFT)
  if (state.status === 'idle') void controller.load()

  const typed = draft.custom ? parseCapacity(draft.customText) : undefined
  const target = draft.custom
    ? (typed !== undefined && Number.isInteger(typed) && typed > 0 ? typed : undefined)
    : draft.preset ?? state.current
  const invalidCustom = draft.custom && draft.customText.trim().length > 0 && target === undefined

  const rows: { key: string; displayName: string; outcome: RouteOutcome | undefined }[]
    = state.routes.map(entry => ({
      key: entry.key,
      displayName: entry.route.displayName,
      outcome: target === undefined
        ? undefined
        : outcomeOf(target, entry.discovered, entry.ceilingsKnown),
    }))
  const downgraded = rows.reduce((total, row) => total + (row.outcome?.downgraded.length ?? 0), 0)

  if (state.status === 'error') {
    return (
      <div className={styles.section}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.error}>{`${t('loadFailed')} ${state.error?.message ?? ''}`}</p>
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => { void controller.load() }}>{t('retry')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('intro')}</p>

      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.label}>{t('windowLabel')}</span>
          {state.current === undefined ? null : (
            <span className={styles.current}>
              {fill(t('current'), { window: formatCapacity(state.current) })}
            </span>
          )}
        </div>
        <p className={styles.hint}>{t('windowHint')}</p>

        <div className={styles.chips}>
          {WINDOW_PRESETS.map(preset => (
            <Pill
              key={preset.label}
              active={!draft.custom && target === preset.tokens}
              onClick={() => { setDraft({ preset: preset.tokens, custom: false, customText: draft.customText }) }}
            >
              {preset.label}
            </Pill>
          ))}
          <Pill
            active={draft.custom}
            onClick={() => { setDraft({ ...draft, custom: true }) }}
          >
            {t('custom')}
          </Pill>
        </div>

        {draft.custom ? (
          <div className={styles.custom}>
            <Input
              value={draft.customText}
              placeholder={t('customPlaceholder')}
              aria-label={t('custom')}
              aria-invalid={invalidCustom}
              onChange={(event) => { setDraft({ ...draft, customText: event.target.value }) }}
            />
          </div>
        ) : null}
        {invalidCustom ? <p className={styles.error}>{t('customInvalid')}</p> : null}

        {/* Once a window is chosen the per-service table explains any spread,
            and a legitimate clamp is itself a spread — so this only speaks up
            while nothing has been chosen yet. */}
        {state.mixed && target === undefined
          ? <p className={styles.notice}>{t('mixed')}</p>
          : null}
        {downgraded > 0 && target !== undefined ? (
          <p className={styles.notice}>
            {fill(t('downgradeNotice'), {
              count: String(downgraded),
              window: formatCapacity(target),
            })}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={state.applying || !state.writable || target === undefined || rows.length === 0}
            onClick={() => { if (target !== undefined) void controller.apply(target) }}
          >
            {state.applying ? t('applying') : t('apply')}
          </Button>
        </div>

        {state.status === 'ready' && !state.writable
          ? <p className={styles.notice}>{t('readOnly')}</p>
          : null}
        {state.savedWindow === null || state.savedWindow !== target ? null : (
          <p className={styles.saved} role="status" aria-live="polite">
            {fill(t('saved'), { window: formatCapacity(state.savedWindow) })}
          </p>
        )}
        {state.writeFailure === null ? null : (
          <p className={styles.error}>{writeFailureText(state.writeFailure, t)}</p>
        )}
      </div>

      {state.status !== 'ready' ? null : rows.length === 0 ? (
        <p className={styles.notice}>{t('noRoutes')}</p>
      ) : (
        <div className={styles.card}>
          <span className={styles.label}>{t('routesLabel')}</span>
          <ul className={styles.routes}>
            {rows.map(row => (
              <RouteRow
                key={row.key}
                displayName={row.displayName}
                outcome={row.outcome}
                target={target}
                t={t}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

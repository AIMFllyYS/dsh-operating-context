/**
 * One configured service and what the chosen window does to it. The row states
 * an outcome rather than echoing the input, because the interesting case is the
 * one where the chosen window does not survive contact with a model's limit.
 */
import { useState, type ReactNode } from 'react'
import { DisclosureRow, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatCapacity } from './capacity.ts'
import { fill, type OperatingContextKey } from './locales.ts'
import styles from './Section.module.css'
import type { RouteOutcome } from './ceiling.ts'

/** Props of {@link RouteRow}. */
export interface RouteRowProps {
  displayName: string
  /** What the chosen window does here, or `undefined` while no window is chosen. */
  outcome: RouteOutcome | undefined
  /** The window the user picked, or `undefined` while the choice is unusable. */
  target: number | undefined
  t: (key: OperatingContextKey) => string
}

/**
 * Render one service row.
 * @param props - the service, its outcome, and the dictionary.
 * @returns the row.
 */
export function RouteRow(props: RouteRowProps): ReactNode {
  const { displayName, outcome, target, t } = props
  const [open, setOpen] = useState(false)
  const downgraded = outcome?.downgraded.length ?? 0

  return (
    <li className={styles.route}>
      <div className={styles.routeHead}>
        <span className={styles.routeName}>{displayName}</span>
        {outcome === undefined || target === undefined ? null : (
          <span className={styles.routeSummary}>
            {outcome.unknownCeilings
              ? t('routeUnknown')
              : fill(t('routeApplied'), {
                count: String(outcome.applied),
                window: formatCapacity(target),
              })}
          </span>
        )}
      </div>
      {outcome === undefined || downgraded === 0 ? null : (
        <DisclosureRow
          icon={<IconChevronDownOutline14 />}
          title={fill(t('downgradeTitle'), { count: String(downgraded) })}
          open={open}
          expandable
          expandOnRowClick
          onToggle={() => { setOpen(current => !current) }}
          titleClassName={styles.disclosureTitle}
        >
          <p className={styles.hint}>{t('downgradeHint')}</p>
          <ul className={styles.models}>
            {outcome.downgraded.map(model => (
              <li key={model.id} className={styles.model}>
                <span className={styles.modelId}>{model.id}</span>
                <span className={styles.modelCeiling}>
                  {fill(t('modelCeiling'), { window: formatCapacity(model.ceiling) })}
                </span>
              </li>
            ))}
          </ul>
        </DisclosureRow>
      )}
    </li>
  )
}

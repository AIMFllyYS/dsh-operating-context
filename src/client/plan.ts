/**
 * How this plugin reads and writes one provider profile.
 *
 * The multi-provider adapter resolves a model's capacity as
 * `entry.contextWindow ?? catalog.contextWindow ?? defaultContextWindow`, where
 * `entry` is either a `models[]` row or a `modelOverrides` patch. That order is
 * why writing `defaultContextWindow` alone changes nothing for a route whose
 * models come from the installed catalog, and why the write target has to be
 * chosen from the profile's shape rather than assumed:
 *
 * - a non-empty `models[]` replaces the served catalog, so capacities belong on
 *   its rows and `modelOverrides` beside it is rejected;
 * - an absent or empty `models[]` on a catalog route serves the catalog, so
 *   `modelOverrides` is the only entry-level lever;
 * - a hand-declared route has no catalog to override, so only its own rows or
 *   the route default can say anything.
 *
 * Within that, one rule decides the value: a model is never given a window
 * larger than it can hold, and a model that already holds the right number is
 * left alone rather than restated. Leaving it alone is what makes the write
 * idempotent and what makes choosing a large window undo earlier clamps.
 */
import { ceilingsOf, effectiveWindow } from './ceiling.ts'
import type { DiscoveredModel, PathOp, ProviderTarget } from './api.ts'

/** A route joined with its settings profile and whatever the adapter disclosed. */
export interface RouteProfile {
  route: ProviderTarget
  /** Settings value at the route's `settingsPath`. */
  profile: unknown
  /** Models the adapter could describe locally; empty when it could not. */
  discovered: readonly DiscoveredModel[]
  /** Whether {@link RouteProfile.discovered} is an authoritative capacity list. */
  ceilingsKnown: boolean
}

interface ProviderProfile {
  models?: unknown
  modelOverrides?: unknown
  defaultContextWindow?: unknown
}

function asProfile(profile: unknown): ProviderProfile {
  return typeof profile === 'object' && profile !== null ? profile as ProviderProfile : {}
}

function modelRows(profile: unknown): Record<string, unknown>[] | undefined {
  const { models } = asProfile(profile)
  if (!Array.isArray(models) || models.length === 0) return undefined
  return models.map(row => (typeof row === 'object' && row !== null ? row as Record<string, unknown> : {}))
}

function overrides(profile: unknown): Record<string, unknown> | undefined {
  const { modelOverrides } = asProfile(profile)
  if (typeof modelOverrides !== 'object' || modelOverrides === null) return undefined
  return modelOverrides as Record<string, unknown>
}

function overrideEntry(profile: unknown, id: string): Record<string, unknown> | undefined {
  const entry = overrides(profile)?.[id]
  return typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : undefined
}

function ceilingMap(entry: RouteProfile): ReadonlyMap<string, number> {
  return entry.ceilingsKnown ? ceilingsOf(entry.discovered) : new Map()
}

/**
 * The windows a route's models hold right now, after the same precedence the
 * adapter applies. Reading the resolved value rather than the raw setting is
 * what keeps the page from reporting a number that is written but inert.
 * @param entry - the route joined with its profile.
 * @returns one window per model, or the route default when there are no models.
 */
export function effectiveWindows(entry: RouteProfile): number[] {
  const { defaultContextWindow } = asProfile(entry.profile)
  const fallback = typeof defaultContextWindow === 'number' ? defaultContextWindow : undefined
  const rows = modelRows(entry.profile)
  if (rows !== undefined) {
    return rows.flatMap((row) => {
      const declared = row['contextWindow']
      if (typeof declared === 'number') return [declared]
      return fallback === undefined ? [] : [fallback]
    })
  }
  const ceilings = ceilingMap(entry)
  if (entry.discovered.length > 0) {
    return entry.discovered.flatMap((model) => {
      const patched = overrideEntry(entry.profile, model.id)?.['contextWindow']
      if (typeof patched === 'number') return [patched]
      const ceiling = ceilings.get(model.id)
      if (ceiling !== undefined) return [ceiling]
      return fallback === undefined ? [] : [fallback]
    })
  }
  return fallback === undefined ? [] : [fallback]
}

/**
 * The settings mutations that put a route under a chosen window.
 * @param entry - the route joined with its profile and disclosed capacities.
 * @param target - the window the user picked.
 * @returns path operations for this route, addressed from its namespace root.
 */
export function planRoute(entry: RouteProfile, target: number): PathOp[] {
  const at = (...tail: string[]): string[] => [...entry.route.settingsPath, ...tail]
  const ops: PathOp[] = [{ op: 'set', path: at('defaultContextWindow'), value: target }]
  const ceilings = ceilingMap(entry)
  const rows = modelRows(entry.profile)

  if (rows !== undefined) {
    // A models list replaces the served catalog, so every capacity has to be
    // written back on the rows themselves; the list is stored whole because a
    // user-layer array replaces the layer below it rather than merging into it.
    ops.push({
      op: 'set',
      path: at('models'),
      value: rows.map((row) => {
        const id = typeof row['id'] === 'string' ? row['id'] : undefined
        const ceiling = id === undefined ? undefined : ceilings.get(id)
        return { ...row, contextWindow: effectiveWindow(target, ceiling) }
      }),
    })
    return ops
  }

  for (const [id, ceiling] of ceilings) {
    const existing = overrideEntry(entry.profile, id)
    if (ceiling > target) {
      ops.push({ op: 'set', path: at('modelOverrides', id, 'contextWindow'), value: target })
      continue
    }
    // The catalog already holds a window at or below the target, so an override
    // would only restate it — and removing ours is how a larger choice lets the
    // native capacity come back.
    if (existing?.['contextWindow'] === undefined) continue
    ops.push(Object.keys(existing).length === 1
      ? { op: 'unset', path: at('modelOverrides', id) }
      : { op: 'unset', path: at('modelOverrides', id, 'contextWindow') })
  }

  if (entry.ceilingsKnown) {
    const described = new Set(entry.discovered.map(model => model.id))
    for (const id of Object.keys(overrides(entry.profile) ?? {})) {
      if (described.has(id)) continue
      // An override naming a model the catalog does not describe is refused
      // outright, and that refusal takes the whole route down with it — every
      // other field on the entry included. A catalog upgrade that drops a model
      // is how a profile ends up here, so clearing the dead entry is what lets
      // the route load and be written again.
      ops.push({ op: 'unset', path: at('modelOverrides', id) })
    }
  }
  return ops
}

/**
 * A model's ceiling is the largest context window it can actually hold. It has
 * to come from somewhere this plugin never writes to, otherwise applying a
 * window would raise the ceiling it is supposed to be clamped by, and every
 * later apply would drift further from the truth.
 *
 * The one source that qualifies is the multi-provider adapter's installed
 * catalog, read back through `llm.discoverModels`. For a catalog route that
 * call answers from local data with no network and no credential, so it is safe
 * on page load. For every other route the answer is that the ceiling is unknown
 * — which is different from "unlimited", and is reported as such.
 */
import { PI_AI_NS, type DiscoveredModel, type ProviderTarget } from './api.ts'

/** Stable identity of a route across a reload. */
export function routeKey(route: Pick<ProviderTarget, 'settingsNs' | 'provider'>): string {
  return `${route.settingsNs}:${route.provider}`
}

/**
 * Whether a route's native capacities can be read without a network request.
 *
 * Only a route the multi-provider adapter ships a catalog for qualifies:
 * `declared === true` means the adapter knows the route from configuration
 * alone and interrogation would fall through to the endpoint's own listing.
 * An absent `declared` means the adapter draws no such distinction, so it is
 * not evidence of a catalog either.
 * @param route - the route as `llm.providers` reported it.
 * @returns true when `llm.discoverModels` will answer from local data.
 */
export function hasDiscoverableCeilings(route: ProviderTarget): boolean {
  return route.settingsNs === PI_AI_NS && route.declared === false
}

/**
 * Reduce a discovery answer to the ceilings it disclosed.
 * @param models - what `llm.discoverModels` returned.
 * @returns model id to native context window, skipping models that disclosed none.
 */
export function ceilingsOf(models: readonly DiscoveredModel[]): Map<string, number> {
  const ceilings = new Map<string, number>()
  for (const model of models) {
    const { contextWindow } = model
    if (contextWindow === undefined) continue
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) continue
    ceilings.set(model.id, contextWindow)
  }
  return ceilings
}

/**
 * Apply the clamp: a chosen window never exceeds what the model can hold.
 * @param target - the window the user picked.
 * @param ceiling - the model's native maximum, or `undefined` when unknown.
 * @returns the window that will actually be in force.
 */
export function effectiveWindow(target: number, ceiling: number | undefined): number {
  return ceiling === undefined ? target : Math.min(target, ceiling)
}

/** One model that cannot hold the chosen window. */
export interface DowngradedModel {
  id: string
  ceiling: number
}

/** What choosing a window means for one route. */
export interface RouteOutcome {
  /** Models whose native ceiling is below the chosen window. */
  downgraded: DowngradedModel[]
  /** Models the chosen window applies to unchanged. */
  applied: number
  /** True when this route's native capacities could not be read. */
  unknownCeilings: boolean
}

/**
 * Describe what a chosen window does to one route, so the page can state the
 * outcome instead of restating the input.
 *
 * A model that disclosed no capacity counts as applied: nothing caps it, so the
 * chosen window is what it will run with.
 * @param target - the window the user picked.
 * @param models - the route's models as the adapter described them.
 * @param known - whether the description is an authoritative capacity list.
 * @returns the per-route outcome.
 */
export function outcomeOf(
  target: number,
  models: readonly DiscoveredModel[],
  known: boolean,
): RouteOutcome {
  if (!known) return { downgraded: [], applied: 0, unknownCeilings: true }
  const ceilings = ceilingsOf(models)
  const downgraded: DowngradedModel[] = []
  let applied = 0
  for (const model of models) {
    const ceiling = ceilings.get(model.id)
    if (ceiling !== undefined && ceiling < target) downgraded.push({ id: model.id, ceiling })
    else applied += 1
  }
  downgraded.sort((left, right) => right.ceiling - left.ceiling || left.id.localeCompare(right.id))
  return { downgraded, applied, unknownCeilings: false }
}

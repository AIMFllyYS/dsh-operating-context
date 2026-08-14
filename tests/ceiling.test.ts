import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ceilingsOf, effectiveWindow, hasDiscoverableCeilings, outcomeOf, routeKey,
} from '../src/client/ceiling.ts'
import type { ProviderTarget } from '../src/client/api.ts'

function route(settingsNs: string, declared?: boolean): ProviderTarget {
  return {
    provider: 'demo',
    displayName: 'Demo',
    settingsNs,
    settingsPath: [],
    active: true,
    ...declared === undefined ? {} : { declared },
  }
}

test('only a catalog-backed pi-ai route can be interrogated without a network call', () => {
  assert.equal(hasDiscoverableCeilings(route('llm-pi-ai', false)), true)
  // A declared route would fall through the catalog short-circuit to the
  // endpoint's own listing, which is a network request.
  assert.equal(hasDiscoverableCeilings(route('llm-pi-ai', true)), false)
  // Absent is not false: the adapter simply draws no such distinction.
  assert.equal(hasDiscoverableCeilings(route('llm-pi-ai')), false)
  assert.equal(hasDiscoverableCeilings(route('llm-deepseek')), false)
})

test('ceilingsOf keeps only usable disclosed capacities', () => {
  const ceilings = ceilingsOf([
    { id: 'a', contextWindow: 1_000_000 },
    { id: 'b' },
    { id: 'c', contextWindow: 0 },
    { id: 'd', contextWindow: 1.5 },
    { id: 'e', contextWindow: 256_000, maxTokens: 8192 },
  ])
  assert.deepEqual([...ceilings], [['a', 1_000_000], ['e', 256_000]])
})

test('effectiveWindow clamps to the ceiling and passes an unknown one through', () => {
  assert.equal(effectiveWindow(400_000, 256_000), 256_000)
  assert.equal(effectiveWindow(200_000, 256_000), 200_000)
  assert.equal(effectiveWindow(256_000, 256_000), 256_000)
  assert.equal(effectiveWindow(400_000, undefined), 400_000)
})

test('outcomeOf separates the models that cannot hold the chosen window', () => {
  const outcome = outcomeOf(400_000, [
    { id: 'big', contextWindow: 1_000_000 },
    { id: 'small', contextWindow: 128_000 },
    { id: 'mid', contextWindow: 256_000 },
    { id: 'exact', contextWindow: 400_000 },
    // Nothing caps a model that disclosed no capacity, so it gets the choice.
    { id: 'silent' },
  ], true)
  assert.equal(outcome.unknownCeilings, false)
  assert.equal(outcome.applied, 3)
  assert.deepEqual(outcome.downgraded, [
    { id: 'mid', ceiling: 256_000 },
    { id: 'small', ceiling: 128_000 },
  ])
})

test('outcomeOf reports unknown ceilings rather than inventing a default', () => {
  const outcome = outcomeOf(400_000, [{ id: 'a', contextWindow: 128_000 }], false)
  assert.deepEqual(outcome, { downgraded: [], applied: 0, unknownCeilings: true })
})

test('routeKey separates same-named routes in different namespaces', () => {
  assert.equal(routeKey({ settingsNs: 'llm-pi-ai', provider: 'deepseek' }), 'llm-pi-ai:deepseek')
  assert.notEqual(
    routeKey({ settingsNs: 'llm-pi-ai', provider: 'deepseek' }),
    routeKey({ settingsNs: 'llm-deepseek', provider: 'deepseek' }),
  )
})

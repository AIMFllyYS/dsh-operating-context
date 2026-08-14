import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectiveWindows, planRoute, type RouteProfile } from '../src/client/plan.ts'
import type { DiscoveredModel, ProviderTarget } from '../src/client/api.ts'

function route(settingsNs: string, settingsPath: string[], declared?: boolean): ProviderTarget {
  return {
    provider: 'demo',
    displayName: 'Demo',
    settingsNs,
    settingsPath,
    active: true,
    ...declared === undefined ? {} : { declared },
  }
}

function entry(overrides: {
  settingsNs?: string
  settingsPath?: string[]
  declared?: boolean
  profile: unknown
  discovered?: readonly DiscoveredModel[]
  ceilingsKnown?: boolean
}): RouteProfile {
  return {
    route: route(overrides.settingsNs ?? 'llm-pi-ai', overrides.settingsPath ?? ['providers', 'demo'], overrides.declared ?? false),
    profile: overrides.profile,
    discovered: overrides.discovered ?? [],
    ceilingsKnown: overrides.ceilingsKnown ?? true,
  }
}

test('a catalog route with no models list is capped through modelOverrides', () => {
  // This is the shape that made writing defaultContextWindow alone inert: the
  // models come from the installed catalog, whose capacity outranks the route
  // default, so only an entry-level override changes anything.
  const ops = planRoute(entry({
    profile: { apiKeyEnv: 'DEMO_KEY', defaultContextWindow: 1_000_000 },
    discovered: [
      { id: 'big', contextWindow: 1_000_000 },
      { id: 'small', contextWindow: 256_000 },
    ],
  }), 400_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 400_000 },
    { op: 'set', path: ['providers', 'demo', 'modelOverrides', 'big', 'contextWindow'], value: 400_000 },
  ])
})

test('a model already at or below the chosen window is left alone', () => {
  const ops = planRoute(entry({
    profile: { defaultContextWindow: 400_000 },
    discovered: [{ id: 'small', contextWindow: 128_000 }],
  }), 400_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 400_000 },
  ])
})

test('choosing a window at the ceiling removes the override this plugin wrote', () => {
  const ops = planRoute(entry({
    profile: {
      defaultContextWindow: 400_000,
      modelOverrides: { big: { contextWindow: 400_000 } },
    },
    discovered: [{ id: 'big', contextWindow: 1_000_000 }],
  }), 1_000_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 1_000_000 },
    { op: 'unset', path: ['providers', 'demo', 'modelOverrides', 'big'] },
  ])
})

test('removing a capacity override keeps the other fields on that entry', () => {
  const ops = planRoute(entry({
    profile: {
      modelOverrides: { big: { contextWindow: 400_000, maxTokens: 8192 } },
    },
    discovered: [{ id: 'big', contextWindow: 1_000_000 }],
  }), 1_000_000)

  assert.deepEqual(ops[1], {
    op: 'unset',
    path: ['providers', 'demo', 'modelOverrides', 'big', 'contextWindow'],
  })
})

test('an override the catalog no longer describes is cleared, not left to wedge the route', () => {
  const ops = planRoute(entry({
    profile: {
      modelOverrides: {
        big: { contextWindow: 400_000 },
        retired: { contextWindow: 400_000, maxTokens: 8192 },
      },
    },
    discovered: [{ id: 'big', contextWindow: 1_000_000 }],
  }), 400_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 400_000 },
    { op: 'set', path: ['providers', 'demo', 'modelOverrides', 'big', 'contextWindow'], value: 400_000 },
    { op: 'unset', path: ['providers', 'demo', 'modelOverrides', 'retired'] },
  ])
})

test('a route whose ceilings are unknown keeps its overrides untouched', () => {
  const ops = planRoute(entry({
    declared: true,
    ceilingsKnown: false,
    profile: { modelOverrides: { anything: { contextWindow: 400_000 } } },
  }), 200_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 200_000 },
  ])
})

test('a route with a models list is written on its rows, never through overrides', () => {
  const ops = planRoute(entry({
    settingsNs: 'llm-deepseek',
    settingsPath: [],
    ceilingsKnown: false,
    profile: {
      defaultContextWindow: 1_000_000,
      models: [
        { id: 'chat', contextWindow: 1_000_000, maxTokens: 256_000 },
        { id: 'reasoner', contextWindow: 1_000_000 },
      ],
    },
  }), 256_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['defaultContextWindow'], value: 256_000 },
    {
      op: 'set',
      path: ['models'],
      value: [
        { id: 'chat', contextWindow: 256_000, maxTokens: 256_000 },
        { id: 'reasoner', contextWindow: 256_000 },
      ],
    },
  ])
})

test('rows are clamped per model when the catalog discloses their ceilings', () => {
  const ops = planRoute(entry({
    profile: { models: [{ id: 'big' }, { id: 'small' }] },
    discovered: [
      { id: 'big', contextWindow: 1_000_000 },
      { id: 'small', contextWindow: 200_000 },
    ],
  }), 400_000)

  assert.deepEqual(ops[1], {
    op: 'set',
    path: ['providers', 'demo', 'models'],
    value: [
      { id: 'big', contextWindow: 400_000 },
      { id: 'small', contextWindow: 200_000 },
    ],
  })
})

test('a hand-declared route can only be given the route default', () => {
  const ops = planRoute(entry({
    declared: true,
    ceilingsKnown: false,
    profile: { apiKeyEnv: 'DEMO_KEY', baseURL: 'https://gateway.example' },
  }), 200_000)

  assert.deepEqual(ops, [
    { op: 'set', path: ['providers', 'demo', 'defaultContextWindow'], value: 200_000 },
  ])
})

test('effectiveWindows reports what the adapter resolves, not what is stored', () => {
  // An override wins, then the catalog, then the route default — so a route
  // whose default says 400K while its catalog says 256K reports 256K.
  assert.deepEqual(effectiveWindows(entry({
    profile: {
      defaultContextWindow: 400_000,
      modelOverrides: { patched: { contextWindow: 128_000 } },
    },
    discovered: [
      { id: 'patched', contextWindow: 1_000_000 },
      { id: 'catalog', contextWindow: 256_000 },
      { id: 'silent' },
    ],
  })), [128_000, 256_000, 400_000])
})

test('effectiveWindows reads a models list off its rows', () => {
  assert.deepEqual(effectiveWindows(entry({
    ceilingsKnown: false,
    profile: {
      defaultContextWindow: 400_000,
      models: [{ id: 'a', contextWindow: 256_000 }, { id: 'b' }],
    },
  })), [256_000, 400_000])
})

test('effectiveWindows falls back to the route default alone', () => {
  assert.deepEqual(effectiveWindows(entry({
    ceilingsKnown: false,
    profile: { defaultContextWindow: 200_000 },
  })), [200_000])
  assert.deepEqual(effectiveWindows(entry({
    ceilingsKnown: false,
    profile: { apiKeyEnv: 'DEMO_KEY' },
  })), [])
})

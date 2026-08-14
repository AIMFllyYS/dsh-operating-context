import assert from 'node:assert/strict'
import { test } from 'node:test'
import { en, fill, zh } from '../src/client/locales.ts'

test('both dictionaries cover the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('matching entries take the same slots, so neither loses a number', () => {
  const slotsOf = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? '').sort()
  for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
    assert.deepEqual(slotsOf(en[key]), slotsOf(zh[key]), `${key} slots differ`)
  }
})

test('no dictionary entry names a setting, a file, or an adapter', () => {
  // The page is for someone who never opened settings.yaml; naming its keys here
  // is how engineering vocabulary leaks into a user-facing surface.
  const forbidden = [
    'contextWindow', 'defaultContextWindow', 'modelOverrides',
    'settings.yaml', 'llm-pi-ai', 'llm-deepseek', 'preset', 'isolate', 'Host',
  ]
  for (const [key, text] of [...Object.entries(zh), ...Object.entries(en)]) {
    for (const term of forbidden) {
      assert.equal(text.includes(term), false, `${key} mentions ${term}`)
    }
  }
})

test('fill substitutes slots and leaves an unknown one visible', () => {
  assert.equal(fill('{count} models at {window}', { count: '2', window: '400K' }), '2 models at 400K')
  assert.equal(fill('{count} models', {}), '{count} models')
  assert.equal(fill('no slots', { count: '2' }), 'no slots')
})

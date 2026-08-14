import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCapacity, parseCapacity, WINDOW_PRESETS } from '../src/client/capacity.ts'

test('parseCapacity matches the official Models spelling', () => {
  assert.equal(parseCapacity(''), undefined)
  assert.equal(parseCapacity('   '), undefined)
  assert.equal(parseCapacity('131072'), 131_072)
  assert.equal(parseCapacity(' 256K '), 256_000)
  assert.equal(parseCapacity('256k'), 256_000)
  assert.equal(parseCapacity('1M'), 1_000_000)
  assert.equal(parseCapacity('1m'), 1_000_000)
  assert.equal(parseCapacity('1M'), parseCapacity('1000K'))
  assert.equal(parseCapacity('2.3M'), 2_300_000)
  assert.equal(Number.isInteger(parseCapacity('1.5M')), true)
  assert.equal(Number.isNaN(parseCapacity('abc')), true)
  assert.equal(Number.isNaN(parseCapacity('1G')), true)
})

test('formatCapacity round-trips K/M spellings', () => {
  assert.equal(formatCapacity(1_000_000), '1M')
  assert.equal(formatCapacity(256_000), '256K')
  assert.equal(formatCapacity(1_500_000), '1500K')
  assert.equal(formatCapacity(131_072), '131072')
  assert.equal(parseCapacity(formatCapacity(256_000)), 256_000)
})

test('every preset is a whole number of thousands the field can read back', () => {
  for (const preset of WINDOW_PRESETS) {
    assert.equal(formatCapacity(preset.tokens), preset.label)
    assert.equal(parseCapacity(preset.label), preset.tokens)
  }
})

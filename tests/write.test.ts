import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeBatches } from '../src/client/write.ts'

test('writeBatches reports complete progress in order', async () => {
  const seen: string[] = []
  const result = await writeBatches([
    { ns: 'first', payload: 1 },
    { ns: 'second', payload: 2 },
  ], async (batch) => {
    seen.push(batch.ns)
  })

  assert.deepEqual(seen, ['first', 'second'])
  assert.deepEqual(result, { ok: true, applied: 2, total: 2 })
})

test('writeBatches preserves partial progress and the original failure', async () => {
  const expected = new Error('second namespace conflicted')
  const seen: string[] = []
  const result = await writeBatches([
    { ns: 'first', payload: 1 },
    { ns: 'second', payload: 2 },
    { ns: 'third', payload: 3 },
  ], async (batch) => {
    seen.push(batch.ns)
    if (batch.ns === 'second') throw expected
  })

  assert.deepEqual(seen, ['first', 'second'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.applied, 1)
  assert.equal(result.total, 3)
  assert.equal(result.reason, expected)
})

test('writeBatches distinguishes a first-batch failure from a partial write', async () => {
  const result = await writeBatches([
    { ns: 'first', payload: 1 },
    { ns: 'second', payload: 2 },
  ], async () => {
    throw new Error('revision conflict')
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.applied, 0)
  assert.equal(result.total, 2)
})

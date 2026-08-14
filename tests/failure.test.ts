import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CodedError } from '../src/client/api.ts'
import { failureOf, WRITE_BLOCKED, writeFailureText } from '../src/client/failure.ts'
import { zh, type OperatingContextKey } from '../src/client/locales.ts'

const t = (key: OperatingContextKey): string => zh[key]

test('failureOf keeps a code when the thrower supplied one', () => {
  assert.deepEqual(failureOf(new CodedError('stale', 'settings-conflict')), {
    code: 'settings-conflict',
    message: 'stale',
  })
  assert.deepEqual(failureOf(new Error('socket closed')), {
    code: undefined,
    message: 'socket closed',
  })
  assert.deepEqual(failureOf('nope'), { code: undefined, message: 'nope' })
})

test('a settings conflict is explained, not reported as a raw code', () => {
  const text = writeFailureText({ code: 'settings-conflict', message: 'revision 7 != 5' }, t)
  assert.equal(text, zh.conflict)
  assert.equal(text.includes('revision'), false)
})

test('every code this plugin raises has words of its own', () => {
  for (const code of Object.values(WRITE_BLOCKED)) {
    const text = writeFailureText({ code, message: 'internal detail' }, t)
    assert.equal(text.includes('internal detail'), false, `${code} leaked its message`)
    assert.equal(text.includes('operating-context/'), false, `${code} leaked its code`)
  }
})

test('an unrecognized failure keeps the host own words rather than guessing', () => {
  const text = writeFailureText({ code: 'settings-rejected', message: 'unknown model "x"' }, t)
  assert.equal(text, `${zh.writeFailed} unknown model "x"`)
})

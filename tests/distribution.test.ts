import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function text(path: string): Promise<string> {
  return readFile(resolve(ROOT, path), 'utf8')
}

test('the installable package ships artifacts without lifecycle builds', async () => {
  const manifest = JSON.parse(await text('package.json')) as {
    files?: string[]
    scripts?: Record<string, string>
    dsh?: { client?: { inject?: string[] } }
  }

  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(manifest.scripts?.[hook], undefined, `${hook} must not run for consumers`)
  }
  assert.deepEqual(manifest.files, [
    'CHANGELOG.md',
    'lib/index.js',
    'lib/client.js',
    'lib/client.js.map',
    'cordis.patch.yml',
  ])
  assert.deepEqual(manifest.dsh?.client?.inject, [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-api-remotes',
  ])
})

test('the committed browser artifact is loader-ready and debuggable', async () => {
  const client = await text('lib/client.js')
  const sourceMap = JSON.parse(await text('lib/client.js.map')) as {
    sources?: string[]
    sourcesContent?: Array<string | null>
  }

  assert.match(client, /window\.__ModuleLoader__\.load\(\{\s*id: "dsh-operating-context"/)
  assert.match(client, /sourceMappingURL=client\.js\.map/)
  assert.ok(sourceMap.sources?.some(source => source.endsWith('/src/client/index.ts')))
  assert.equal(sourceMap.sourcesContent?.length, sourceMap.sources?.length)
  assert.ok(sourceMap.sourcesContent?.every(source => typeof source === 'string'))
})

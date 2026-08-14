/**
 * Git-install build: pnpm runs this after fetching sources. It must not
 * assume a sibling DeepSeek-Harness checkout or a pre-existing lib/.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
rmSync(join(root, 'lib'), { recursive: true, force: true })

const tsdown = join(root, 'node_modules', 'tsdown', 'dist', 'run.mjs')
const result = spawnSync(process.execPath, [tsdown], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(result.status === null ? 1 : result.status)

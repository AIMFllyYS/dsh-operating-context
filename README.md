# dsh-operating-context

English | [中文](README.zh.md)

Settings page **工作窗口** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It caps every configured model service to one working context window — the same `contextWindow` the adapter, the ContextMeter, and official compaction already read — and never asks a model to hold more than it can.

It does **not** mount a second compaction engine, wrap `resolveModel`, or patch adapter config through a bundle patch (a patch replaces the whole row and would wipe keys and endpoints). Everything goes through `settings.mutate` in the user layer.

GitHub topic: [`dsh-plugin`](https://github.com/topics/dsh-plugin).

Compatibility baseline: reviewed against DeepSeek Harness `0.1.0-rc.5`
(`47f943859bef60e4160492346772ded9b24f765a`, 2026-08-14). The Harness plugin
surface is still release-candidate software, so rebuild and test this package
when moving to a newer Harness release.

## Install

This is a DeepSeek Harness **bundle**. It does not run on its own, and there is no global `dsh` command unless you put one on PATH. Official Harness entry is `npx @deepseek-ai/dsh`.

A first-time user needs:

1. [Node.js](https://nodejs.org/) `^22.19.0` or `>=24`
2. [pnpm](https://pnpm.io/installation) on PATH (`corepack enable` is enough; `dsh plugin` forwards to pnpm)
3. Then the commands below. First `npx @deepseek-ai/dsh web` also creates the `web` profile.

```sh
npx @deepseek-ai/dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context
```

The repository ships reviewed, prebuilt `lib/` artifacts. Installation does not run package code or require an `allowBuilds` entry. Pin a commit if you do not want a later push to change what runs:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context#<sha>
```

From a DeepSeek Harness source checkout, the same verbs go through `pnpm dsh` instead of `npx`:

```sh
pnpm dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context
```

From this plugin's checkout:

```sh
pnpm install
pnpm bundle
npx @deepseek-ai/dsh plugin --profile web add .
```

Confirm the layer, then start the Web UI:

```sh
npx @deepseek-ai/dsh --profile web --dump-config   # look for a "# == dsh-operating-context" layer
npx @deepseek-ai/dsh web                           # still port 3080
```

After install, open **Settings → 工作窗口** (between Models and Plugins). That page is this plugin:

![Settings → 工作窗口](assets/ds-context.png)

Pick a size and apply. Models, the usage ring, and official auto-compact follow through the settings event. Leaving and reopening this Settings section restores the common saved choice from each route's `defaultContextWindow`; per-model native clamps remain visible underneath and do not erase that choice.

An apply can span more than one settings namespace, while Harness mutations
are namespace-scoped rather than one cross-namespace transaction. If a later
batch fails after an earlier one committed, the page reports the exact completed
batch count and reloads the authoritative settings state. It never presents a
partial write as a rollback or leaves the pre-write snapshot on screen.

Unload:

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-operating-context
```

Written values stay in `~/.dsh/settings.yaml`; removing the plugin does not revert them. When the chosen window reaches a catalog model's known native ceiling, this plugin removes its capacity override so the native value can take effect again. Unknown ceilings and explicit `models` lists cannot be reset that way.

If an authoritative catalog no longer contains a model that still has a
`modelOverrides` entry, the adapter rejects that stale entry and can take down
the whole route. The page reports how many such entries an apply will remove;
the removal is never attempted when the catalog is unknown.

## Troubleshooting installation

If an older revision fails during a Git install with a frozen-lockfile,
`autoInstallPeers`, or `allowBuilds` message, do not change the consumer
profile's pnpm policy to make that revision compile. Git package managers treat
`build`, `prepare`, `prepack`, `preinstall`, `install`, and `postinstall` as
signals that a repository must be built before installation. Current revisions
contain the compiled `lib/` files and define none of those Git build triggers.

You can verify a checkout before installing it:

```sh
node -e "const p=require('./package.json'); for (const s of ['build','prepare','prepack','preinstall','install','postinstall']) if (p.scripts?.[s]) process.exit(1)"
test -f lib/index.js && test -f lib/client.js && test -f lib/client.js.map
```

On PowerShell, use:

```powershell
$p = Get-Content -Raw package.json | ConvertFrom-Json
foreach ($name in 'build','prepare','prepack','preinstall','install','postinstall') {
  if ($p.scripts.$name) { throw "$name must not be present in a Git-distributed package" }
}
Get-Item lib/index.js, lib/client.js, lib/client.js.map
```

The package's local `pnpm-workspace.yaml` keeps optional Harness peers out of
standalone development installs. pnpm remains the supported development package
manager.

## What it writes

Capacity spelling matches the Models page: **256K = 256000**, not 262144.

The write target follows the profile's shape, because the adapter resolves a capacity as `entry.contextWindow ?? catalog.contextWindow ?? defaultContextWindow`:

| Route shape | Written |
| --- | --- |
| Catalog route with no `models` list | `modelOverrides.<id>.contextWindow`, plus `defaultContextWindow` |
| Any route with a `models` list | every `models[].contextWindow`, plus `defaultContextWindow` |
| Hand-declared route | `defaultContextWindow` only |

This is why writing `defaultContextWindow` alone has no effect on a route whose models come from the installed catalog: the catalog's own value outranks it.

## Ceilings

A model is never given a window larger than it can hold. The ceiling is read from the multi-provider adapter's installed catalog through `llm.discoverModels`, which for a catalog route answers from local data with no network request and no credential. For a hand-declared route, or for `llm-deepseek` (which registers no discovery), the ceiling is unknown and the page says so rather than guessing.

When the chosen window is at or below a model's ceiling, no override is written and any earlier one is removed — the catalog value is already correct. That is what makes applying idempotent, and what makes choosing a larger window restore native capacities.

## Provider compatibility

The algorithm does not contain a provider-name allow-list. OpenCode, Kimi
Coding, Anthropic, and other installed `llm-pi-ai` catalog routes use the same
Harness directory contract, local catalog ceilings, and
`defaultContextWindow`/`modelOverrides` planning. A newly added catalog
provider therefore participates without a plugin-specific branch.

A hand-declared or private gateway is deliberately not queried when this page
opens: discovery may contact its endpoint and require a credential. If it has
an explicit `models` list, the plugin updates each row's `contextWindow` while
preserving endpoint, protocol, credential, names, output limits, and unknown
metadata. Without a list it writes only `defaultContextWindow`. Such a route's
native ceilings remain unknown and the UI says so rather than guessing.

An entirely new independent Harness adapter is compatible when its advertised
settings route follows this same capacity shape. The current Harness directory
does not expose a generic capability flag for arbitrary future schemas, so the
plugin cannot promise model-level clamping for an adapter that does not expose
`defaultContextWindow`, `models`, or catalog discovery.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm bundle
npm pack --dry-run
```

`src/index.ts` is a Host loader stub; all behavior is in the client bundle. `api.ts`, `capacity.ts`, `ceiling.ts`, and `plan.ts` are pure and carry the tests; `store.ts` and the components are the only files that touch platform modules.

`lib/` is a committed distribution artifact. After changing `src/`, rebuild it and include the resulting `lib/index.js`, `lib/client.js`, and `lib/client.js.map` in the same commit. Consumers must never need an install-time build script.

Before publishing or pushing a release candidate, run the commands above twice
if build tooling changed and confirm the second build leaves `git status`
clean. The CSS module export map is sorted deliberately so identical sources
produce byte-identical client artifacts.

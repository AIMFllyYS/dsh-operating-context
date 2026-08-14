# dsh-operating-context

English | [中文](README.zh.md)

Settings page **工作窗口** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It caps every configured model service to one working context window — the same `contextWindow` the adapter, the ContextMeter, and official compaction already read — and never asks a model to hold more than it can.

It does **not** mount a second compaction engine, wrap `resolveModel`, or patch adapter config through a bundle patch (a patch replaces the whole row and would wipe keys and endpoints). Everything goes through `settings.mutate` in the user layer.

GitHub topic: [`dsh-plugin`](https://github.com/topics/dsh-plugin).

## Install

This is a DeepSeek Harness **bundle**. It does not run on its own, and there is no global `dsh` command unless you put one on PATH. Official Harness entry is `npx @deepseek-ai/dsh`.

A first-time user needs:

1. [Node.js](https://nodejs.org/) `^22.19.0` or `>=24`
2. [pnpm](https://pnpm.io/installation) on PATH (`corepack enable` is enough; `dsh plugin` forwards to pnpm)
3. Then the commands below. First `npx @deepseek-ai/dsh web` also creates the `web` profile.

```sh
npx @deepseek-ai/dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context
```

A git install fetches sources, not `lib/`. This package ships a self-contained `prepare` script that builds the published entries. pnpm ≥10 blocks that script until the consumer allows it, so the first `add` fails; copy the exact key it printed into the profile's `pnpm-workspace.yaml` (usually `~/.dsh/profiles/web/pnpm-workspace.yaml`):

```yaml
allowBuilds:
  dsh-operating-context: true
```

Then re-run the same `add`. Pin a commit if you do not want a later push to change what runs:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context#<sha>
```

From a DeepSeek Harness source checkout, the same verbs go through `pnpm dsh` instead of `npx`:

```sh
pnpm dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context
```

From this plugin's checkout (no `allowBuilds` needed):

```sh
pnpm install
pnpm build
npx @deepseek-ai/dsh plugin --profile web add .
```

Confirm the layer, then start the Web UI:

```sh
npx @deepseek-ai/dsh --profile web --dump-config   # look for a "# == dsh-operating-context" layer
npx @deepseek-ai/dsh web                           # still port 3080
```

After install, open **Settings → 工作窗口** (between Models and Plugins). That page is this plugin:

![Settings → 工作窗口](assets/ds-context.png)

Pick a size and apply. Models, the usage ring, and official auto-compact follow through the settings event.

Unload:

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-operating-context
```

Written values stay in `~/.dsh/settings.yaml`; removing the plugin does not revert them. Choosing the largest preset does, because that clears the overrides rather than writing a new number.

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

## Develop

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`src/index.ts` is a Host loader stub; all behavior is in the client bundle. `api.ts`, `capacity.ts`, `ceiling.ts`, and `plan.ts` are pure and carry the tests; `store.ts` and the components are the only files that touch platform modules.

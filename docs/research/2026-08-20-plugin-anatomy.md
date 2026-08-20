# 调研存档：dsh-operating-context 插件解剖

> 存档日期：2026-08-20
> 来源：对本仓库 `main @ 3aafd8f` 的完整通读
> 状态：**原样存档，未经删改**。用于将来开发时直接复用，不必重新调研。

---

这是单包 Git 分发的 DeepSeek Harness 浏览器插件：Host 侧几乎是空 stub，真正逻辑在 client bundle 里，通过 Settings 槽位挂「工作窗口」页，并用 `settings.mutate` 把所有模型路由的 contextWindow 限制到同一工作窗口。仓库已提交预构建 `lib/`，没有 monorepo、没有 CI/scripts，也没有官方插件 API 文档——契约都写在 `package.json` 的 `dsh` 字段、`cordis.patch.yml` 和客户端 `name`/`inject`/`apply` 上。新的兄弟插件可以直接复制这套双面构建骨架。

---

## 总览：这是什么

`dsh-operating-context` 是一个 **DeepSeek Harness bundle（Cordis 双面插件）**：

- **Host 半边**（`src/index.ts` → `lib/index.js`）：几乎空的 function-plugin stub，只为占 Loader 行。
- **Client 半边**（`src/client/` → `lib/client.js`）：在 Web Settings 里注册「工作窗口 / Operating context」页，通过官方 `settings.mutate` 把每个已配置模型路由的 `contextWindow` 限制到同一个工作窗口。

它**不**挂第二套 compaction、**不** wrap `resolveModel`、**不用 bundle patch 改适配器配置**（那种 patch 会整行替换，密钥/endpoint 会被清掉）。

兼容基线：DeepSeek Harness `0.1.0-rc.5`（commit `47f943859bef60e4160492346772ded9b24f765a`，2026-08-14）。

---

## 1. `package.json`（全文）

仓库里没有 `dependencies`、没有 `publishConfig`、没有 `bin`。`files` 故意极窄：只发 changelog、两个 JS 产物、sourcemap、`cordis.patch.yml`。

```json
{
  "name": "dsh-operating-context",
  "version": "0.1.0",
  "description": "DeepSeek Harness settings page: cap every configured model service to a working context window, clamped to what each model can actually hold",
  "license": "MIT",
  "homepage": "https://github.com/AIMFllyYS/dsh-operating-context",
  "bugs": {
    "url": "https://github.com/AIMFllyYS/dsh-operating-context/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/AIMFllyYS/dsh-operating-context.git"
  },
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": [
    "CHANGELOG.md",
    "lib/index.js",
    "lib/client.js",
    "lib/client.js.map",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-api-remotes"
      ]
    }
  },
  "scripts": {
    "bundle": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-strip-types --test tests/capacity.test.ts tests/ceiling.test.ts tests/distribution.test.ts tests/failure.test.ts tests/locales.test.ts tests/plan.test.ts tests/write.test.ts"
  },
  "engines": {
    "node": "^22.19.0 || >=24.0.0"
  },
  "peerDependencies": { /* 全部 optional，见下 */ },
  "peerDependenciesMeta": { /* 每个 peer 都 optional: true */ },
  "devDependencies": {
    "@types/node": "^22.19.0",
    "@types/react": "^18.3.12",
    "lightningcss": "^1.32.0",
    "tsdown": "^0.22.2",
    "typescript": "^5.9.2"
  },
  "keywords": ["dsh-plugin", "deepseek-harness", "dsh", "context-window", "llm", "typescript"]
}
```

**插件元数据（`dsh`）——兄弟插件必须复制的部分：**

| 字段 | 含义 |
|---|---|
| `dsh.bundle.patch` | 指向 `cordis.patch.yml`；`dsh plugin add` 把这一层叠进 profile |
| `dsh.client.platform` | `"web"`：只给 Web UI 加载 client bundle |
| `dsh.client.inject` | 告诉 Host **要把哪些平台包放进浏览器 module table**。这是「Harness client contract」的核心：与官方 Models 设置页对齐，**不是**把所有 import 都列出来 |

`inject` 只有 4 个包：`runtime`、`ui-settings`、`locale`、`api-remotes`。实际代码还 `require` 了 `react`、`ui-primitives`、`web-react`、`schema-form`、`runtime/client`——那些被当成 **已经由 shell 提供的平台模块**（tsdown `neverBundle`），不必写进 `dsh.client.inject`。

**peerDependencies（全部 optional）：**

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-api-remotes`
- `@deepseek-ai/dsh-client-locale`
- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-schema-form`
- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-settings`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-web-react`
- `react` `^18.2.0`

**刻意缺失（distribution contract）：**

- 没有 `build` / `prepare` / `prepack` / `preinstall` / `install` / `postinstall`（Git/pnpm 会把这些当成安装期构建触发器）
- 开发构建命令叫 `bundle`，不是 `build`
- 没有 `publishConfig`（分发走 Git：`github:AIMFllyYS/dsh-operating-context#v0.1.0`，不是 npm）

---

## 2. `pnpm-workspace.yaml`：单包，不是 monorepo

全文：

```yaml
packages:
  - .

autoInstallPeers: false
strictPeerDependencies: false

peerDependencyRules:
  ignoreMissing:
    - '@deepseek-ai/*'
    - react
```

`packages: [.]` 是 **workspace-of-one**：让独立开发时不要把 optional Harness peers 拉进来（那些包不在本仓库，运行时由 Host module table 解析）。`pnpm-lock.yaml` 的 `importers` 只有 `.`，只锁了 5 个 devDependency。

**对 monorepo 的含义：** 现在还不是 monorepo。迁过去时这段 yaml 要改成真正的 `packages: ['plugins/*', ...]`，并且 `ignoreMissing: ['@deepseek-ai/*']` 很可能要保留——除非把 Harness 本身也放进同一个 workspace。

---

## 3. `cordis.patch.yml`（全文）

```yaml
# One Loader row. The Host half contributes nothing; the row exists so the
# client-module scanner reaches dsh.client and serves lib/client.js.
- insert:
    - id: operating-context
      name: dsh-operating-context
```

作用：往 Cordis Loader 配置里 **插入一行**。`id` 是 function-plugin id（必须和 `export const name` 一致），`name` 是 npm 包名。Host `apply()` 是空的；这一行的唯一目的是让 **client-module scanner** 扫到 `package.json` 的 `dsh.client`，从而把 `lib/client.js` 发给浏览器。

`dsh plugin add` 之后 `--dump-config` 会出现 `# == dsh-operating-context` 层。

---

## 4. `src/` 目录树与每个文件

```
src/
  index.ts                         Host stub（17 行）
  client/
    index.ts                       Client apply：注册 Settings 页
    api.ts                         官方 Web RPC 的结构类型（不 import harness）
    capacity.ts                    256K = 256000 拼写
    ceiling.ts                     目录上限 + clamp
    plan.ts                        按路由形态规划 PathOp
    write.ts                       跨 namespace 顺序写入（非事务）
    failure.ts                     错误码 → 文案
    store.ts                       SnapshotStore + load/apply
    locales.ts                     zh/en 词典
    Section.tsx                    Settings 页
    RouteRow.tsx                   每个服务一行
    Section.module.css             只用 --dsw-alias-* token
    css-modules.d.ts               *.module.css 声明
    platform.d.ts                  平台模块的 ambient 声明
```

### `src/index.ts`（全文，Host 入口）

```ts
/**
 * Host half of a browser-only plugin. The page, its state, and its settings
 * writes all live in the client bundle (`./client`); this entry exists because
 * the Loader row is what makes the package active, and the client-module scan
 * only reaches packages the profile loaded.
 */

/** Function-plugin id (Loader row id is `operating-context`). */
export const name = 'operating-context'

/**
 * Claim the Loader row without contributing Host behavior.
 */
export function apply(): void {
  // No Host contribution: the operating window is written through the official
  // settings RPC from the browser, so nothing here would have a second reader.
}
```

**没有** `Context`、`Service`、`schema`、`inject`、Config。Cordis function-plugin 最小面就是 `{ name, apply }`。

### `src/client/index.ts`（全文，真正的插件注册）

```ts
/**
 * Browser half: register the operating-window page on the official Settings
 * shell and keep it in step with the settings document.
 * ...
 */
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// ...

const NS = 'settings.operatingContext'
const ORDER = 12   // Models=10, this=12, Plugins=15

export const inject = ['slots', 'locale', 'connection', 'remote']
export const name = 'operating-context'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'operating-context: dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new OperatingContextStore(connection.api)
  const useSnapshot = bindSnapshotSelector(controller.store)
  const t = ctx.locale.bind(NS)
  const injected = (): OperatingContextInjected => ({ controller, useSnapshot, t })

  ctx.effect(() => {
    const refresh = (): void => { controller.refreshIfLoaded() }
    const disposers = [
      ctx.remote.$on('settings/document-updated', refresh),
      ctx.remote.$on('llm/adapters-updated', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'operating-context: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'operating-context',
    order: ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, OperatingContextSection))
}
```

**插件 API 表面（从本文件反推）：**

| 导出 / 调用 | 作用 |
|---|---|
| `export const name` | 浏览器 fiber 的 function-plugin 名，与 Loader `id` 相同 |
| `export const inject` | **Cordis 服务注入**（字符串服务名），不是 `dsh.client.inject` 的包名 |
| `export function apply(ctx)` | 注册副作用 |
| `ctx.locale.register(ns, { zh, en })` | 挂词典 |
| `ctx.locale.bind(ns)` | 得到 `t(key)` |
| `ctx.get('connection').api` | 官方 Web RPC 客户端 |
| `ctx.remote.$on(event, fn)` | 订阅 Host 推送 |
| `ctx.slots.inject('settings.section', factory)` | 往 Settings 导航/内容槽塞一页 |
| `ctx.slots.register({ name, id, order, label, locale, inject }, Component)` | 注册 React 段 |
| `ctx.effect(setup, label)` | 生命周期；setup 可返回 disposer |

`ClientContext` 是 **结构类型**，不 `import` `@deepseek-ai/cordis`。Harness 包运行时从 module table 解析，本仓库不安装它们。

### 其余文件摘要

| 文件 | 导出 | 平台 API | 职责 |
|---|---|---|---|
| `api.ts` | `PI_AI_NS='llm-pi-ai'`, `RpcResponse`, `ProviderTarget`, `DiscoveredModel`, `NamespaceView`, `PathOp`, `OperatingContextApi`, `CodedError`, `unwrap` | 无 | 镜像 `@deepseek-ai/dsh-host-apiproxy` 的最小 RPC 面：`llm.providers` / `llm.discoverModels` / `settings.describe` / `settings.mutate` |
| `capacity.ts` | `WINDOW_PRESETS` (200K/256K/400K/1M), `parseCapacity`, `formatCapacity` | 无 | **256K = 256000**，不是 262144 |
| `ceiling.ts` | `routeKey`, `hasDiscoverableCeilings`, `ceilingsOf`, `effectiveWindow`, `outcomeOf` | 无 | 只有 `settingsNs==='llm-pi-ai' && declared===false` 才本地 discovery；否则上限未知 |
| `plan.ts` | `RouteProfile`, `commonRequestedWindow`, `obsoleteOverrideIds`, `effectiveWindows`, `planRoute` | 无 | 适配器解析顺序：`entry.contextWindow ?? catalog.contextWindow ?? defaultContextWindow` |
| `write.ts` | `writeBatches` | 无 | 按 ns 顺序 mutate；部分成功返回 `{ ok:false, applied, total, reason }` |
| `failure.ts` | `WRITE_BLOCKED` (`operating-context/read-only` 等), `failureOf`, `writeFailureText` | 无 | `settings-conflict` 等映射到词典 |
| `store.ts` | `OperatingContextStore`, `OperatingContextState` | `createSnapshotStore` (`dsh-client-runtime/client`), `getPath` (`dsh-client-schema-form`) | load / apply / refreshIfLoaded |
| `locales.ts` | `zh`, `en`, `fill`, `OperatingContextKey` | 无 | 用户文案禁止出现 `contextWindow`、`settings.yaml`、adapter 名 |
| `Section.tsx` | `OperatingContextSection` | `Button/Input/Pill` | 预设 chips + 自定义 + 应用；outlet 没 inject 时返回 `null` |
| `RouteRow.tsx` | `RouteRow` | `DisclosureRow`, `IconChevronDownOutline14` | 被 clamp 的模型可展开 |
| `Section.module.css` | CSS modules | 无 | 颜色全是 `--dsw-alias-*` |
| `platform.d.ts` | ambient modules | 声明用到的平台成员 | 本仓库不安装这些包，类型只写在这里 |

### Settings 页怎么画出来

1. Host 加载 Loader 行 `operating-context` → scanner 看到 `dsh.client` → 浏览器拉 `lib/client.js`。
2. `lib/client.js` 包在 `window.__ModuleLoader__.load({ id: "dsh-operating-context", factory })` 里。
3. Client `apply`：注册 locale → 建 Store → 订 `settings/document-updated` 和 `llm/adapters-updated` → `slots.inject('settings.section', ...)`。
4. Settings shell 按 `order: 12` 在 Models(10) 和 Plugins(15) 之间插入导航「工作窗口」。
5. `OperatingContextSection` 用 `useSnapshot` 渲染；首次 `status==='idle'` 时 `controller.load()`。
6. Apply 走 `settings.mutate({ ns, ops, expectedRevision })`，再 `load()` 收敛权威状态。

**本插件没有：** Host `schema`/Config UI、thinking modes、API key 配置页、模型选择器。API key 留在官方 Models 页。

---

## 5. `lib/`：提交进 git 的构建产物

| 文件 | 大小 | 角色 |
|---|---|---|
| `lib/index.js` | 530 B | ESM Host stub |
| `lib/client.js` | 46 KB | CJS 浏览器工厂，包在 `__ModuleLoader__` 里 |
| `lib/client.js.map` | 71 KB | 内嵌 sourcesContent |

`.gitignore` 只有：

```
node_modules/
*.tsbuildinfo
.DS_Store
```

**`lib/` 不在 gitignore 里，且已跟踪。** README 规定：改 `src/` 后必须 `pnpm bundle`，同一 commit 带上三个产物。消费者 Git 安装时 **禁止跑安装期构建**。

`distribution.test.ts` 会断言：`files` 列表、无 lifecycle scripts、`client.js` 含 `__ModuleLoader__.load({ id: "dsh-operating-context"`、sourcemap 指向 `src/client/index.ts` 且带 `sourcesContent`。

---

## 6. `tsdown.config.ts`（5 KB）为什么这么长

两个独立 build，**不是**一份普通 tsdown 配置。注释写明：从 Harness client-bundle preset **拷贝**过来，这样 Git 安装不需要旁边有 DeepSeek-Harness checkout。

### Build 1 — Host

- entry: `src/index.ts` → `lib/index.js`
- format: ESM，platform: node，target: es2024
- `dts: false`，`clean: false`（不能清掉另一个 build 的产物）

### Build 2 — Client（大部分体积在这里）

- entry: `src/client/index.ts` → `lib/client.js`（强制 `entryFileNames: 'client.js'`）
- format: **CJS**，platform: **browser**，sourcemap: true
- `deps.neverBundle` = 平台模块 + `@deepseek-ai/dsh-client-runtime/client`
- `deps.alwaysBundle` = 其余一切（本插件自己的 TS/CSS）

**包一层 ModuleLoader：**

```js
banner: `window.__ModuleLoader__.load({ id: "dsh-operating-context", factory: (require) => {`
intro:  'var module = { exports: {} }; var exports = module.exports;'
footer: 'return module.exports; } });'
```

产物开头/结尾就是：

```js
window.__ModuleLoader__.load({
  id: "dsh-operating-context",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let ... = require("@deepseek-ai/dsh-client-web-react");
    // ...
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
```

**两个自定义插件：**

1. **`dsh-client-bundle-purity`**：任何非白名单的 `@deepseek-ai/*` 值 import 直接 throw。允许：
   - `CLIENT_EXTERNALS`（react、cordis、slots、web-react、primitives、attachment、schema-form、runtime/client）
   - `VENDORED_LIBRARY`：`@deepseek-ai/(cosmokit|schemastery)`
   - `INLINE_SAFE`：`dsh-(host-apiproxy|session|llm|tools|brand)`
   - `GENERATED_REMOTE`：`@deepseek-ai/dsh-…/remote`
2. **`dsh-css-modules-inline`**：用 lightningcss 编 CSS Modules（`[hash]_[local]`），**按 local 名排序**后内联成 `<style data-plugin="dsh-operating-context">`。排序是为了 **字节级可复现构建**。

`sourceAssetPath` 处理 `lib/types/` → `src/` 的路径回写（拷贝自 Harness preset；本包没用 dts）。

`define` 把 `process.env.NODE_ENV` / `import.meta.env` 钉成 `'production'`。

**兄弟插件要改的常量：** 顶上的 `const ID = 'dsh-operating-context'`（同时是 CSS tag 和 ModuleLoader id）。其余 preset 可共享。

---

## 7. `scripts/`

**不存在。** 没有 `scripts/` 目录，也没有 release 脚本。开发命令全在 `package.json`：

| 命令 | 做什么 |
|---|---|
| `pnpm bundle` | tsdown 双面构建 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Node 内置 test runner + `--experimental-strip-types`，**显式列出 7 个文件**（加测试文件要改这行） |
| `npm pack --dry-run` | README 要求，不在 scripts 里 |

没有 `dev` / watch / release / changeset。

---

## 8. `tests/`

- **框架：** Node.js 内置 `node:test` + `node:assert/strict`
- **不跑 React / store / Section**（那些依赖平台模块）
- **39 个 test()**，与 CHANGELOG 一致

| 文件 | 覆盖 |
|---|---|
| `capacity.test.ts` (3) | 256K 拼写、round-trip、preset |
| `ceiling.test.ts` (7) | 只有 catalog pi-ai 可本地 discovery；OpenCode/Kimi/Anthropic 无白名单；clamp；unknown |
| `plan.test.ts` (16) | 三种路由形态的 PathOp；obsolete override 清理；手写网关保留 endpoint/凭据；`commonRequestedWindow` |
| `write.test.ts` (3) | 顺序批次、部分成功、首批失败 |
| `failure.test.ts` (4) | 码→文案，不泄漏内部码 |
| `locales.test.ts` (4) | zh/en 键与 `{slot}` 对齐；禁止工程词汇 |
| `distribution.test.ts` (2) | **分发契约**：无 lifecycle scripts、`files` 精确列表、`dsh.client.inject` 精确列表、client 产物 loader-ready |

`tsconfig.json`：`include: ["src", "tests"]`，`jsx: react-jsx`，`module: NodeNext`，`allowImportingTsExtensions: true`，`noEmit: true`。测试直接 import `../src/client/*.ts`。

---

## 9. `assets/`

只有 **`assets/ds-context.png`**（约 306 KB，已进 git）。README 截图：Settings → 工作窗口。

**不在 `package.json` `files` 里**，npm pack 不会带上；只给 GitHub README 用。没有图标、没有 locales JSON、没有其它静态资源。CSS 编进 `client.js`。

---

## 10. README：功能、安装、契约

### 插件做什么

设置页 **工作窗口**：把每个已配置模型服务限制到同一个工作 `contextWindow`（适配器、ContextMeter、官方 auto-compact 读的都是这个字段），且不超过模型原生上限。

### 怎么装（不是独立 CLI）

官方入口：`npx @deepseek-ai/dsh`（没有全局 `dsh` 除非自己装）。需要 Node `^22.19.0 || >=24` + pnpm。

```sh
npx @deepseek-ai/dsh plugin --profile web add github:AIMFllyYS/dsh-operating-context#v0.1.0
npx @deepseek-ai/dsh --profile web --dump-config   # 应有 # == dsh-operating-context
npx @deepseek-ai/dsh web                           # :3080
```

本地：`pnpm install && pnpm bundle && npx @deepseek-ai/dsh plugin --profile web add .`

卸载：`npx @deepseek-ai/dsh plugin --profile web remove dsh-operating-context`
写入留在 `~/.dsh/settings.yaml`，卸插件 **不会** 回滚。

### 「operating context」实际是什么

用户选一个窗口（200K / 256K / 400K / 1M / 自定义），应用到全部路由。写入形态：

| 路由形态 | 写入 |
|---|---|
| 目录路由且无 `models` 列表 | `modelOverrides.<id>.contextWindow` + `defaultContextWindow` |
| 任何带 `models` 列表 | 每个 `models[].contextWindow` + `defaultContextWindow` |
| 手写声明路由 | 只写 `defaultContextWindow` |

只写 `defaultContextWindow` 对目录路由无效，因为 catalog 值优先级更高。所选窗口 ≤ 已知天花板时 **删掉 override**，让原生值回来（幂等 + 可恢复）。

重进设置页时，用各路由共同的 `defaultContextWindow` 恢复选择（即使有的模型被 clamp 到更小）。

### 三个「契约」（仓库用语，不是独立 spec 文件）

这些词来自 commit `5df8670`（harness client contract）和 `7effe5c`（distribution and recovery contract），内容散落在 README / tests / CHANGELOG。

**1. Harness client contract**

- `dsh.client.inject` 必须与官方 Models 设置页的依赖边对齐（那 4 个包）
- Client 必须是 `__ModuleLoader__` CJS 工厂
- 平台模块 external，禁止跨插件值 import（purity plugin）
- 用 Settings slot + locale + connection.api + remote 事件，不自己发明 Host 通道
- 对照 Harness `0.1.0-rc.5`；升级 Harness 要重建测试

**2. Distribution contract**（`tests/distribution.test.ts` 锁死）

- 提交预构建 `lib/index.js` + `lib/client.js` + `lib/client.js.map`
- **禁止** `build/prepare/prepack/preinstall/install/postinstall`
- `files` 白名单；Git 安装不改消费者 `allowBuilds`
- CSS export map 排序 → 二次 `pnpm bundle` 后 `git status` 干净
- 本地用 `pnpm-workspace.yaml` 跳过 optional peers（曾经用 `.npmrc`，已删）

**3. Recovery contract**（写入失败 / 过期 override）

- Harness mutate **按 namespace，不是跨 ns 事务**
- 后批失败：报告 `applied/total`，**重新 describe**，不把部分写入说成 rollback，不留写入前快照
- 写入中忽略 pushed invalidation，写完显式 `load()` 收敛
- catalog 里已不存在的 `modelOverrides` 条目会让适配器拒绝整条路由；apply 前披露将删除多少条；**catalog 未知时绝不清理**
- 卸插件不还原 `settings.yaml`

---

## 11. CHANGELOG 演化（全部发生在 2026-08-14）

没有 0.1.0 之前的公开历史；一天内从初稿推到 stable。

| 版本 | 要点 |
|---|---|
| 初稿 `4108968` | 发布 operating-context Settings 页 |
| 随后 docs | npx 安装、README 截图、中文 README |
| `723e641` | 开始提交预构建产物 |
| `b819c3a` | 跨 namespace 写入后收敛 |
| `5df8670` | 对齐 client contract：`dsh.client.inject` 缩成 4 包；tsdown `external`→`deps.neverBundle` |
| `ed911da` | CSS 排序，产物确定性 |
| `7effe5c` | 写下 distribution + recovery |
| **0.1.0-rc.1** | 准备 rc |
| **0.1.0-rc.2** | 去掉全部 Git build trigger，`pnpm bundle`；部分写入报告；loading 挪到 effect；拒绝非 safe-integer；过期 override 披露；34 tests |
| **0.1.0-rc.3** | remount 保留 400K/自定义选择；OpenCode/Kimi/Anthropic/手写网关回归；39 tests |
| **0.1.0** | rc.3 升正式版，推荐 tag `v0.1.0` |

---

## 12. CI / lint / format / release

**全部没有。**

- 无 `.github/`、无 workflows
- 无 ESLint / Prettier / Biome / EditorConfig / Husky
- 无 Changesets / semantic-release / `release.yml`
- 无 `.npmrc`、无 `.nvmrc`

发版靠手工：改 version → `pnpm typecheck && pnpm test && pnpm bundle` → commit `lib/` → git tag

`LICENSE`：MIT，Copyright 2026 dsh-operating-context contributors。

---

## 13. DeepSeek Harness 插件机制（仅能从本仓库反推）

本仓库 **没有** `docs/`、没有插件 SDK README。下面是从代码能确定的扩展点。

### 发现 / 加载

```
npx @deepseek-ai/dsh plugin --profile web add <github-or-path>
        ↓
读 package.json.dsh.bundle.patch
        ↓
把 cordis.patch.yml 叠进 web profile（Loader insert）
        ↓
Host 加载包的 main（lib/index.js）→ apply() 可为空
        ↓
client-module scanner 看 dsh.client.platform==="web"
        ↓
浏览器拉 exports["./client"]（lib/client.js）
        ↓
window.__ModuleLoader__ 调 factory(require)
        ↓
读 export name / inject / apply，按 inject 解析 Cordis 服务后调 apply(ctx)
```

### 扩展点（本插件实际用到的）

| 点 | 本插件用法 |
|---|---|
| Loader 行 | `cordis.patch.yml` insert |
| Settings 导航/页 | `ctx.slots.inject('settings.section', …)`，`order` 插在 10 和 15 之间 |
| i18n | `ctx.locale.register('settings.operatingContext', {zh,en})` |
| 设置读写 | `connection.api.settings.describe/mutate` |
| 模型目录 | `connection.api.llm.providers` + `llm.discoverModels` |
| 实时刷新 | `remote.$on('settings/document-updated' | 'llm/adapters-updated')` |
| UI | `dsh-client-ui-primitives` + `--dsw-alias-*` |
| 状态 | `createSnapshotStore` + `bindSnapshotSelector` |

### 明确没有用到的（兄弟插件若需要，本仓库给不了样例）

- Host `Service` / `schema` / Config 表单（官方 Models 页才有 API key、thinking mode）
- 改 `resolveModel`、adapter 配置、compaction
- 用 patch **替换** 适配器行（本插件明确禁止）
- 非 web platform（desktop/CLI）
- 通用 "capability flag"；新 adapter 只有暴露 `defaultContextWindow` / `models` / catalog discovery 才兼容

### 两套 `inject`（迁 monorepo 时最容易混）

1. **`package.json` `dsh.client.inject`**：Host 往浏览器 module table 注入的 **包名**。
2. **`export const inject`**：Cordis fiber 的 **服务名** `['slots','locale','connection','remote']`。

---

## 对 monorepo + 7–8 个兄弟插件的可复用骨架

每个新插件几乎都要复制：

1. `package.json`：`exports`（`.` / `./client` / `./cordis.patch.yml`）、`dsh.bundle` + `dsh.client`、optional peers、`files`、**禁止 lifecycle scripts**、`scripts.bundle`
2. `cordis.patch.yml`：唯一 `id` + 包 `name`
3. `src/index.ts`：`export const name` + 空或有内容的 `apply`
4. `src/client/index.ts`：`name` / `inject` / `apply`；若是 Settings 页则 `slots.inject('settings.section')` 并选不冲突的 `order`
5. `tsdown.config.ts`：只改 `ID`；purity + CSS inline + ModuleLoader banner 共享
6. `src/client/platform.d.ts`：只声明本插件用到的平台成员
7. `tests/distribution.test.ts`：按新包名锁契约
8. 提交 `lib/`

**建议抽成 workspace 包的部分：** `tsdown` client preset、distribution 测试 helper、`platform.d.ts` 基线、pnpm `ignoreMissing @deepseek-ai/*`。

**每个插件必须唯一的：** Loader `id`、包名、`dsh.client` ModuleLoader `ID`、locale namespace、slot `id`/`order`、CSS `data-plugin`。

**本插件特有、不要抽进 preset 的：** `capacity/ceiling/plan/write`、工作窗口 UI、`llm-pi-ai` 目录契约。Host stub 为空是因为写入全走浏览器 RPC；若新插件要在 Node 侧改会话/模型解析，Host `apply` 才会真正有代码。

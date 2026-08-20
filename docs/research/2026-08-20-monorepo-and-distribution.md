# 调研存档：dsh 插件的分发机制与 monorepo 可行性

> 存档日期：2026-08-20
> 来源：`AIMFllyYS/deepseek-harness`（fork of `deepseek-ai/deepseek-harness`）的 `docs/` 与 `apps/cli` 源码，加 pnpm 官方文档
> 状态：**原样存档，未经删改**。这是「一个仓库还是多个仓库」决策的事实依据。

---

## 结论先行

**可以。8 个插件放在一个仓库里，每个都能被独立安装。** 核心原因是：`dsh plugin` 命令本身不做任何依赖解析，它把参数逐字转发给 `pnpm`，而 **pnpm 原生支持从 git 仓库子目录安装**（`#path:/子目录`）。现有的 `github:AIMFllyYS/dsh-operating-context#v0.1.0` 写法，迁到 monorepo 后变成：

```
npx @deepseek-ai/dsh plugin --profile web add "github:AIMFllyYS/dsh-plugins#v0.1.0&path:/plugins/operating-context"
```

下面是完整论证。凡是标注「已验证」的都有源码或官方文档原文支撑；标注「推断」的是根据机制推导但没有实机跑过的。

---

## 一、官方插件编写模型

### 1.1 两个概念：plugin ≠ bundle

`docs/user/develop/basic/publish.md` 开宗明义区分了两层概念（已验证，原文）：

> Installation is built on two concepts. Both are described by a `package.json`, but they carry different kinds of manifest under the `dsh` key, and they answer different questions:
> - A **bundle** is an npm package that ships a configuration layer. Its manifest declares `dsh.bundle`, answering "what does this package contribute?": a patch file that inserts or overrides plugin rows.
> - A **profile** is a directory under `$DSH_HOME/profiles/` describing one runnable composition. Its manifest declares `dsh.profile`, answering "which bundles compose this setup, in what order?".
> A bundle is what you author and distribute; a profile is what a user boots with `dsh --profile`. Nothing is both.

- **plugin（插件）**：一个导出 `apply` 函数的 Cordis 模块，是运行时的最小单元。
- **bundle（分发包）**：一个 npm 包，声明 `dsh.bundle.patch`，指向一个 `cordis.patch.yml`。**这才是可安装、可分发的单位。**

一个 bundle 的 patch 文件里可以 `insert` 任意多行 plugin row，所以「一个 npm 包」可以携带「多个 plugin」——但它们会作为一个整体被启用或禁用。

### 1.2 一个 bundle 包必须包含什么

官方最小示例（`publish.md`，已验证）：

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

有一处关键约束，文档特别强调（已验证，原文）：

> The patch is a YAML array like the `--patch` overlays you have been writing, except plugin rows reference the package **by name** instead of a relative source path so Node resolution finds the installed code.

也就是说 patch row 里的 `name` 必须写**包名**（或 `包名/子路径`，如 `'dsh-hello-plugin/startup'`），不能写相对路径。这一点对 monorepo 很重要：**决定插件能否被找到的是 npm 包名，与它在仓库里的目录位置完全无关。**

另外，没有 `dsh.bundle` 声明的包不会报错，但也不会生效（已验证，原文）：

> A package without the `dsh.bundle` declaration still installs, but only as a plain dependency: `dsh plugin` prints a warning and activates no layer. Use that package format for a library that plugin packages import rather than a plugin users enable.

**这给了 monorepo 一个额外好处：共享的工具库可以作为普通依赖包共存于同一仓库，不会被误当成插件层。**

---

## 二、完整的安装/发布链路

### 2.1 `dsh plugin` 就是一个 pnpm 转发器（这是全部答案的基石）

`apps/cli/src/plugin.ts` 的模块头注释（已验证，逐字引用）：

```
/**
 * `dsh plugin --profile <args...>` — profile plugin management as a
 * thin pnpm forwarder: initialize the profile on first use, run
 * `pnpm <args...>` in the profile directory, then reconcile the
 * `dsh.profile.bundles` layer list against the installed state ...
 */
```

实际执行代码（已验证，逐字引用自 `runPlugin`）：

```ts
const result = spawnSync('pnpm', args.map(argument => anchorPathSpec(argument, process.cwd())), {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
```

`apps/cli/reference/README.md` 也独立确认（已验证，原文）：

> `dsh plugin --profile <args...>` initializes the profile when missing ..., then forwards `<args...>` to `pnpm` with the profile directory as working directory — `add`, `remove`, `why`, `update`, and **every other pnpm verb work unchanged**; pnpm must be on PATH.

唯一的参数改写是 `anchorPathSpec`，它只处理**以 `.` 或 `..` 开头**的相对路径（正则 `/^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/`），把它们锚定到你调用命令时所在的目录。**注册表包名、git URL、`github:` 简写、tarball 路径一律原样透传**——源码注释写得很明确：

> Absolute specs, registry names, and every other pnpm argument pass through untouched.

**结论：dsh 支持的安装规格 = pnpm 支持的安装规格，一字不差。**

### 2.2 安装后 dsh 做了什么：按「真实包名」对账

`reconcilePlugins` 的注释（已验证，逐字引用）——**这段是回答 monorepo 问题的决定性证据**：

```
 * Reconcile `dsh.profile.bundles` against the installed state: pnpm has
 * already written the real installed names (so a git/path/tarball/alias spec
 * on the command line reconciles by its true package name) and materialized
 * the packages. A dependency that resolves to a `dsh.bundle`-declaring
 * package joins the layer stack (appended in dependency order); a
 * dependency-listed name that no longer does — removed, or the installed
 * version dropped the declaration — leaves it.
```

判定逻辑本体只有一行（已验证）：

```ts
function exportsPatch(packageName: string, profileDir: string): boolean {
  // ...
  const manifest = readProfileManifest(NAME, dir)
  return manifest.dsh?.bundle?.patch !== undefined
}
```

**dsh 完全不关心这个包是从哪来的。** 它只看：pnpm 把哪些名字写进了 `dependencies`，这些名字解析出来的 `package.json` 里有没有 `dsh.bundle.patch`。注释里 `a git/path/tarball/alias spec ... reconciles by its true package name` 这半句，直接就是「子目录安装可行」的官方背书。

### 2.3 磁盘布局

`packages/boot/app-boot/src/profile.ts`（已验证）：

- Profile 目录：`$DSH_HOME/profiles/<name>`，`$DSH_HOME` 默认 `~/.dsh`。所以 web profile 在 `~/.dsh/profiles/web/`。
- 首次 `dsh plugin` 会调 `initProfile` 生成三个文件：
  - `package.json` — `{ name: "dsh-profile-web", private: true, dependencies: {}, dsh: { profile: { bundles: [...] } } }`
  - `cordis.patch.yml` — 用户自己的 patch 层，内容模板是 `[]`
  - `pnpm-workspace.yaml` — 内容固定为：
    ```yaml
    packages:
      - .

    nodeLinker: hoisted
    autoInstallPeers: false
    ```
- 插件代码落在 `~/.dsh/profiles/web/node_modules/<包名>/`（hoisted 平铺）。
- 另有 `$DSH_HOME/profiles/node_modules`（注意是 profiles 的**同级** fallback），由 `healProfilesModuleFallback` 每次启动时维护，为 dsh 安装自带的所有包各建一个 symlink。这就是为什么插件要把 `@deepseek-ai/*` 声明为 **optional peerDependencies**——它们会通过 Node 的父目录回溯解析到 dsh 安装自带的那一份，保证全局只有一个 cordis 实例。源码注释说得很清楚：

  > The hoisted linker gives out-of-tree plugins a flat node_modules whose missing peers (cordis and friends) fall through to the healed profiles/node_modules installation fallback, so every plugin shares the installation's single cordis instance instead of a duplicate.

### 2.4 层序（loading order）

`publish.md`（已验证，原文）：

1. `dsh.profile.bundles` 里每个 bundle 的 patch，按列表顺序（`@deepseek-ai/dsh-base` 第一，然后按添加顺序）
2. profile 自己的 `cordis.patch.yml`
3. home 级 `$DSH_HOME/cordis.patch.yml`
4. 每个 `--patch` 覆盖层，按 argv 顺序

后面的层按 row 覆盖前面的，且 **patch 替换整个 `config` 值，不做深合并**。

### 2.5 四种分发渠道（官方枚举）

`publish.md`（已验证）：

| 渠道 | 命令 | 需要 allowBuilds？ |
|---|---|---|
| 本地目录 | `dsh plugin --profile demo add ./hello-plugin` | 否 |
| git 源码 | `dsh plugin --profile demo add github:you/hello-plugin` | **是**（若有 prepare） |
| npm 注册表 | `dsh plugin --profile demo add your-package` | 否 |
| tarball | `dsh plugin --profile demo add ./hello-plugin-0.1.0.tgz` | 否 |

git 安装的那个坑，文档标题就叫 "Installing from GitHub: the build-script catch"（已验证，原文）：

> But a git install fetches **sources, not built artifacts**: nothing runs your `build` script, so a TypeScript package arrives without its `lib/` output and fails to load.
>
> - **The author** ships a `prepare` script — pnpm runs it after a git install ...
> - **The user** allowlists the build. pnpm ≥10 refuses to run a git dependency's `prepare` script until it is explicitly allowed, so the first `add` fails ... copy the exact package key pnpm printed into the profile's `pnpm-workspace.yaml`:
>   ```yaml
>   allowBuilds:
>     dsh-hello-plugin: true
>   ```

文档对这个授权给出了明确的安全警告：

> Treat that allowance as what it is: **permission to execute the package's code on your machine at install time**, outside any sandbox the agent runs under.

**关于现状的重要发现：** `dsh-operating-context` 的 `lib/index.js`、`lib/client.js`、`lib/client.js.map` 都**已提交进仓库**，而 `package.json` 的 `scripts` 里**没有 `prepare`**（只有 `bundle`/`typecheck`/`test`）。也就是说走的是第五条路——**「把构建产物提交进 git，用 tag 分发」**。这条路 pnpm 完全不需要执行任何构建脚本（`main` 指向的 `lib/index.js` 现成存在），因此完全绕开了 allowBuilds 关卡。**这是现在能一条命令装成功的原因，也是迁 monorepo 时最该保留的做法。**

---

## 三、Monorepo 可行性：确定性回答

### 3.1 pnpm 支持 git 子目录（决定性证据）

pnpm 官方文档 `https://pnpm.io/package-sources` 明确列出（已验证，原文）：

> #### Install from a subdirectory of a Git repository
>
> You may also install just a subdirectory from a Git-hosted monorepo using the `path:` parameter. For instance:
> ```
> pnpm add RexSkz/test-git-subfolder-fetch#path:/packages/simple-react-app
> ```
>
> #### Install from a Git repository combining different parameters
>
> It is possible to combine multiple parameters by separating them with `&`. This can be useful for forks of monorepos:
> ```
> pnpm add RexSkz/test-git-subdir-fetch.git#beta\&path:/packages/simple-react-app
> ```
> Installs from the `beta` branch and only the subdirectory at `/packages/simple-react-app`.

这个能力来自 pnpm PR [#7487](https://github.com/pnpm/pnpm/pull/7487)（feat: add sub folder support for git url）。该 PR 的讨论里给出了**同一个 monorepo 的两个子包被独立安装**的 lockfile 实例：

```json
{
  "dependencies": {
    "simple-react-app": "github:RexSkz/test-git-subfolder-fetch.git#path:/packages/simple-react-app",
    "simple-express-server": "github:RexSkz/test-git-subfolder-fetch.git#path:/packages/simple-express-server"
  }
}
```

维护者 zkochan 对存储模型的说明：「It should be okay to store only by Git URL - just 1 item in `packages` and multiple items in `dependencies`.」——即仓库只抓一次，多个子包共享同一个 git 缓存条目。**这对本场景是净收益：8 个插件只克隆 1 次仓库。**

（顺带纠正一个常见误解：npm 和 Yarn Classic 确实不支持 git 子目录，Yarn Berry 只支持 `#workspace=` 这种依赖对方使用 Yarn workspace 的形式。**pnpm 的 `path:` 是三家里最通用的**，而 dsh 恰好强制用 pnpm。）

### 3.2 两端拼起来

- dsh 侧：参数逐字透传给 pnpm；对账按安装后的真实包名，注释明确点名 `a git/path/tarball/alias spec ... reconciles by its true package name`。
- pnpm 侧：`#path:/子目录` 是一等公民，可与 tag/branch/commit 用 `&` 组合。

**因此：monorepo 完全可行，且不需要任何 workaround、不需要 dsh 侧改动。**

### 3.3 推荐的目标形态

```
AIMFllyYS/dsh-plugins/            # 一个仓库
├── plugins/
│   ├── operating-context/        # name: dsh-operating-context
│   │   ├── package.json          # dsh.bundle + dsh.client
│   │   ├── cordis.patch.yml
│   │   ├── lib/                  # 提交进 git
│   │   └── src/
│   ├── foo/                      # name: dsh-foo
│   └── ... (共 8 个)
├── packages/shared/              # 无 dsh.bundle → 只作普通依赖
├── package.json                  # private: true，仅供开发
└── pnpm-workspace.yaml           # 仅供开发，不影响子包被独立安装
```

安装命令（**Windows PowerShell 下务必整体加双引号**，因为 `&` 和 `#` 都是 PowerShell 的特殊字符）：

```powershell
npx @deepseek-ai/dsh plugin --profile web add "github:AIMFllyYS/dsh-plugins#v0.1.0&path:/plugins/operating-context"
npx @deepseek-ai/dsh plugin --profile web add "github:AIMFllyYS/dsh-plugins#v0.1.0&path:/plugins/foo"
```

卸载按**包名**，不是按规格（已验证，`publish.md`：`dsh plugin --profile demo remove dsh-hello-plugin`）：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove dsh-foo
```

本地开发（`anchorPathSpec` 已验证会把相对路径锚定到调用目录，pnpm 官方文档确认目录安装建的是 symlink——「When you install from a directory, a symlink will be created in the current project's `node_modules`, so it is the same as running `pnpm link`」）：

```powershell
cd D:\projects\Dev-Tools\dsh-plugins
npx @deepseek-ai/dsh plugin --profile web add ./plugins/operating-context
```

装完后 profile 的 `package.json` 会长这样（推断，基于 `initProfile` 与 `reconcilePlugins` 的写入逻辑）：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-operating-context": "github:AIMFllyYS/dsh-plugins#v0.1.0&path:/plugins/operating-context",
    "dsh-foo": "github:AIMFllyYS/dsh-plugins#v0.1.0&path:/plugins/foo"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app",
                  "dsh-operating-context", "dsh-foo"]
    }
  }
}
```

注意 `dsh.profile.bundles` 里**只记包名，不记版本或规格**——版本信息全在 `dependencies` 里。所以升级插件就是拿新 tag 重新 `add` 一次。

### 3.4 必须遵守的四条硬约束

1. **子目录包不能用 `workspace:` 协议依赖。** pnpm 抓取子目录时不会带上仓库根的 workspace 上下文（PR #7487 讨论中 zkochan 指出需要「detect if the workspace feature is used and if so, run install in the root of the repository before taking the subdirectory」，实现只在 `packageShouldBeBuilt` 层面做了处理）。如果 `plugins/foo` 依赖 `"shared": "workspace:*"`，从 git 子目录装会失败。**解法**：共享代码要么在构建时 inline 进产物（tsdown 默认会 bundle 本地相对导入），要么共享包单独发到 npm。现在的 `tsdown` 构建方式天然适配前者。

2. **每个插件包必须有全局唯一的 npm 包名。** profile 的 `node_modules` 是 `nodeLinker: hoisted` 平铺的，且 `dsh.profile.bundles` 以包名为键，包名冲突会直接互相覆盖。

3. **继续把 `lib/` 提交进 git，不要加 `prepare`。** 这样 8 个插件的安装都不需要用户去改 `pnpm-workspace.yaml` 的 `allowBuilds`。如果改成 `prepare` 方案，用户要为**每个**插件包单独加一条 allowBuilds 条目，体验会明显变差；而且 monorepo 子目录里的 `prepare` 脚本必须完全自包含——`publish.md` 明确要求「it must not assume dev-only context such as a sibling monorepo checkout」，这在 monorepo 里恰恰是最容易违反的。

4. **`@deepseek-ai/*` 依赖继续声明为 optional peerDependencies。** profile 的 pnpm 配置是 `autoInstallPeers: false`，靠 `$DSH_HOME/profiles/node_modules` 的 symlink fallback 解析。现在的写法是对的，8 个插件都要照抄。

### 3.5 一个需要实测的风险点

pnpm 有过一个 bug（[PR #12344](https://github.com/pnpm/pnpm/pull/12344)，已于 2026-06-13 合并，patch 级修复）：git 子目录依赖的 lockfile resolution 在实际下载 tarball 时会丢掉 `path` 字段，导致后续 frozen install **静默地解包仓库根目录而不是子目录**。PR 描述原文：

> `path` is what the git-hosted tarball fetcher passes to `preparePackage` to extract the subdirectory. A frozen install from the damaged lockfile silently unpacks the repository root instead of the requested package.

本机 pnpm 是 `11.7.0`（dsh 仓库根 `packageManager` 也钉的 `pnpm@11.7.0`），修复合并时间早于常规的 11.7 发布窗口，**大概率已包含**——但没有实际核对 11.7.0 的 changelog，这条标记为**推断**。建议迁移时先拿 2 个插件做一次真实安装验证，确认 `~/.dsh/profiles/web/node_modules/dsh-foo/package.json` 里的 `name` 是子包名而不是 monorepo 根包名。

### 3.6 备选方案对比

| 方案 | 独立安装？ | 额外成本 | 评价 |
|---|---|---|---|
| **git 子目录 `#tag&path:/...`** | 是 | 无 | **推荐**，与现有 tag 流程最接近 |
| 发布到 npm | 是 | 需要 npm 账号 + 发布流水线 | 体验最好（`dsh plugin add dsh-foo`），但 8 个包的发布编排更重 |
| 每插件一条 dist 分支/tag | 是 | 需要构建脚本推送 8 条分支 | 纯属多余——`path:` 已经解决问题，不必自己造 |
| 本地路径安装 | 是 | 用户需要 clone 仓库 | 只适合开发，不适合分发 |
| 单包多 plugin row | **否** | —— | 8 个插件绑成一个整体，无法独立启停 |

最后一行值得强调：`DshBundleManifest` 的定义是（已验证，`profile.ts`）：

```ts
export interface DshBundleManifest {
  /** The patch layer this bundle exports, relative to its package root. */
  patch: string
}
```

`patch` 是**单个字符串**，不是数组。所以**一个 npm 包 = 一个 bundle = 一个 patch 文件 = 一个可独立启停的层**。想要 8 个独立单元，就必须有 8 个 npm 包——但它们可以住在同一个仓库里。

---

## 四、dsh 专属的 package.json 字段

来自 `packages/boot/app-boot/src/profile.ts` 的类型定义（已验证）：

```ts
export interface DshManifestSection {
  bundle?: DshBundleManifest    // { patch: string }
  profile?: DshProfileManifest  // { bundles?: string[] }
}
```

注释明确说「A manifest may declare both roles; **other consumers own additional keys**」——即 `dsh` 命名空间是开放的，profile 启动器只认这两个键。

第三个键 `dsh.client` 由另一个子系统消费（`docs/subsystems/client-modules.md`，已验证）：

> A package joins the table by declaring `dsh.client` (`platform: 'web'`, optional `inject` edges, optional `immediately`) in its package.json and exporting its built bundle at `exports["./client"]`.

汇总成一张表：

| 字段 | 消费者 | 语义 |
|---|---|---|
| `dsh.bundle.patch` | profile 启动器 / `dsh plugin` 对账 | 相对包根的 patch 文件路径（**单个**） |
| `dsh.profile.bundles` | profile 启动器 | 有序的 bundle 包名列表（**只出现在 profile 目录，插件作者不写**） |
| `dsh.client.platform` | `ctx.clientModules` | 固定 `'web'` |
| `dsh.client.inject` | `ctx.clientModules` | 浏览器侧依赖边（包名数组） |
| `dsh.client.immediately` | `ctx.clientModules` | 是否在 boot 第一阶段预取 |

配套要求：带 UI 的插件必须导出 `exports["./client"]`。现有的 `dsh-operating-context` 完全符合，可以直接当作 8 个插件的模板。

**一个仓库能否暴露多个插件？** 能，而且是唯一正确的做法——只是要用 **8 个 package.json**（8 个 npm 包名），不是 1 个 package.json 配 8 个 `dsh.bundle`（协议不支持）。

---

## 五、版本与 tag 约定

### 5.1 官方没有强制约定

文档和源码里没有任何版本号规范、tag 命名规范，也**没有官方插件注册表或市场**。唯一的生态约定是一个 GitHub topic（`README.md` 和 `CONTRIBUTING.md`，已验证，原文）：

> Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.

`CONTRIBUTING.md` 里还有一段值得注意的立场声明：

> DeepSeek Harness is designed to be deeply customizable. We do not believe that packages in the official repository are inherently more important than packages created by the community.

**注意 topic 是打在「仓库」上的。** 从 8 个仓库合成 1 个仓库，发现性上只剩 1 个 topic 条目——这是 monorepo 唯一的实质性损失。建议在仓库 README 里做一个插件索引表补偿。

另外有一条历史证据，说明 pnpm 路线是官方**唯一且经过收敛的**方案。`.agents/notes/implemented/simplification/2026-08-09-remove-repository-plugin.md`（已验证，原文）：

> The repository Plugin path duplicated the profile bundle path for installing and composing third-party packages. It added a `.dsh-plugin` manifest, a generated wrapper, a preparation executable, a second Git/package cache, a Loader builtin, and repository-specific Skill and MCP adapters. **Profile bundles already install npm or Git package specifications through the profile package manager**, retain normal dependency and lifecycle semantics, and contribute an ordered `cordis.patch.yml` layer that can mount ordinary Cordis Plugins.

也就是说 dsh 曾经有过一套自研的插件仓库机制（`.dsh-plugin` manifest、`dsh-plugin-prepare` 可执行文件、独立 git 缓存），在 2026-08-09 被**整体删除**，理由就是「profile bundle + pnpm 已经能做这件事」。**别指望未来会回到自研解析器——押注 pnpm 语义是安全的。**

### 5.2 pnpm 支持的所有 git ref 形式（已验证，官方文档）

```
kevva/is-positive                          # 默认分支最新 commit
kevva/is-positive#97edff6f...              # commit hash
kevva/is-positive#master                   # 分支
zkochan/is-negative#2.0.1                  # tag
andreineculau/npm-publish-git#v0.0.7       # v 前缀 tag  ← 现在用的
zkochan/is-negative#semver:1.0.0           # 严格 semver
kevva/is-positive#semver:^2.0.0            # semver 范围（按 git tag 解析）
```

`semver:` 系列很有意思：它按仓库的 git tag 做 semver 匹配。但在 monorepo 里这会成为问题——`semver:^0.1.0` 匹配的是**仓库级** tag，无法区分是哪个插件的版本。

### 5.3 两种 monorepo tag 策略

**A. 统一版本（推荐起步）** — 全仓库共用一个 tag，所有插件同步发版：

```powershell
git tag v0.2.0 && git push --tags
# 用户
... add "github:AIMFllyYS/dsh-plugins#v0.2.0&path:/plugins/foo"
```

优点是简单，缺点是任何一个插件改动都要求用户更新全部 8 条依赖规格才能保持一致（不更新也能跑，各自钉在各自的 tag 上）。

**B. 每插件独立 tag** — 用 `<插件名>-v<版本>` 命名：

```powershell
git tag operating-context-v0.2.0 && git push --tags
# 用户
... add "github:AIMFllyYS/dsh-plugins#operating-context-v0.2.0&path:/plugins/operating-context"
```

优点是语义精确、独立发版；缺点是 tag 数量膨胀，且 `semver:` 简写彻底失效（必须写全名）。

**两种都能用**，因为 pnpm 的 `#<ref>` 接受任意 git ref 名，与 `&path:` 正交。

### 5.4 关于「钉 commit」的官方建议

`publish.md` 在安全上下文里给的建议（已验证，原文）：

> Only allow packages whose source you trust, and **pin a commit** (`github:you/hello-plugin#<sha>`) so a later push cannot silently change what runs.

注意 tag 是**可移动**的（`git tag -f` + `git push --force`），commit SHA 不可变。如果之后启用 `prepare` 构建路线，钉 commit 就从「建议」变成「必要」了。目前走提交产物路线，风险等级低一些，但 tag 依然可能被误移。

---

## 六、验证程度说明

**已验证（有源码或官方文档原文）：**
- `dsh plugin` 是纯 pnpm 转发器，`spawnSync('pnpm', ...)` 全文引用
- `anchorPathSpec` 只改写 `.`/`..` 开头的相对路径，其余原样透传
- `reconcilePlugins` 按安装后真实包名对账，注释显式点名 git/path/tarball/alias 规格
- `exportsPatch` 判定逻辑 = `manifest.dsh?.bundle?.patch !== undefined`
- `DshBundleManifest.patch` 是单个 string（→ 一包一层）
- profile 磁盘布局、`initProfile` 生成的三个文件与其内容、`pnpm-workspace.yaml` 固定内容
- 四种官方分发渠道及各自的 allowBuilds 要求
- pnpm 的 `#path:/子目录` 与 `#<ref>&path:/...` 语法（pnpm 官方文档 + PR #7487）
- 官方无插件注册表，只有 GitHub topic `dsh-plugin`
- 自研 repository-plugin 机制已于 2026-08-09 删除，收敛到 pnpm 路线
- 现有仓库把 `lib/` 提交进 git 且无 `prepare` 脚本（读的 git 索引）

**推断（机制推导，未实机验证）：**
- 装完后 profile `package.json` 的具体形态
- `workspace:` 协议在子目录安装下会失败（基于 PR #7487 讨论中维护者对 workspace 处理的说明，未实测）
- pnpm 11.7.0 已包含 PR #12344 的 lockfile `path` 修复（时间线吻合，未核对 changelog）

**建议的落地第一步：** 先在 monorepo 里放 2 个插件、打一个 tag、用 `#tag&path:/...` 各装一次，确认 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里出现了两个正确的包名，再批量迁剩下的 6 个。

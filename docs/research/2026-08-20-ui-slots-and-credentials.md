# 调研存档：Web UI slot 目录 与 凭据子系统

> 存档日期：2026-08-20
> 来源：`AIMFllyYS/deepseek-harness` 的 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（生成物）、`packages/client/ui-slots`、`packages/client/ui-theme`、`packages/credentials/*`、`packages/llm/llm-deepseek`、`docs/web-styling.md`、`docs/subsystems/credentials.md`
> 状态：**原样存档，未经删改**。这是「更好地自定义页面内容」和「支持填写多个 API key」两个想法的技术底稿。

---

先说三条结论：

1. **完整 slot 目录是有的**，而且是编译期生成的权威清单（`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`，由 `scripts/gen-client-catalog.ts` 生成）。共 **42 个 slot key**。order=12 的位置判断正确：`general=0 / models=10 / plugins=15 / agent-presets=20`。
2. **Idea C 一半可行**：往列表槽里"加东西"非常顺畅；"改内置面板"要靠 `priority` 抢占单值槽，机制存在但代价极大——抢占一个 `single` 槽会连带摧毁它声明的所有子槽，等于把别的插件的座位一起拆掉。
3. **Idea D 必须有 Host 侧插件**。凭据 seam 的模型是"一个引用名 = 一个值"，`llm-deepseek` 每个实例只有一个 `apiKeyEnv` 字段，官方**完全没有**多 key / 轮换 / 故障转移。纯客户端设置页可以写 N 个 key，但没有任何东西会去选用它们。

---

## 一、UI Slot 目录（42 个，逐条核实）

来源：`slot-catalog.ts`（生成物，标注为 "The compile-time contract of the shipped web bundle's slot surface"）。`replaceRisk` 字段是官方给出的风险标记：`shadows-shipped-ui` = 注册进去会**替换**内置 UI，`none` = 纯追加。

### 1.1 骨架层（shell / layout）

| key | kind | scope | 渲染什么 | 内置占位 | 风险 |
|---|---|---|---|---|---|
| `root` | single | root | 渲染树根洞，由 SlotCore 内建 | ui-layout `AppFrame` | shadows |
| `sidebar` | single | root | 整个左栏 | ui-sidebar `SidebarRoot` | shadows |
| `conversation` | single | session-maybe | 整个中间列（含空态 hero 与会话态） | ui-conversation `ConversationRoot` | shadows |
| `details` | single | session | 右侧详情列 | ui-conversation `DetailsPanel` | shadows |
| `shell.overlay` | list | root | 跨整个 frame 的浮层，在所有列之上、滚动容器之外 | 无 | **none** |
| `sidebar.settings` | single | root | 侧栏底部的设置座位 | ui-settings-general `SettingsRoot` | shadows |
| `sidebar.footer.action` | list | root | 侧栏底部 Settings 旁的可选动作 | ui-cordis `CordisPanel` (`cordis-panel`) | **none** |
| `sidebar.workspaces` | single | root | 工作区/会话浏览区（含搜索、分组列表、所有工作区对话框） | ui-workspace `WorkspaceBrowser` | shadows |
| `sidebar.workspaces.directoryFlow` | single | root | 侧栏目录选择流程洞 | directory-picker-browse / -native | shadows |

`root` 的源码里有一段非常明确的警告，值得原样引用（`packages/client/runtime/src/client/slots.ts`）：

> DO NOT register here. This is a single slot, so a second entry does not sit beside the frame — it **shadows** it… the page would render your component alone, with every seat the frame declares gone. For a surface of your own that floats over the whole app, register into `shell.overlay` instead.

### 1.2 Settings 域（Idea C / D 的主战场）

| key | kind | scope | 渲染什么 | 内置占位（含 order） | 风险 |
|---|---|---|---|---|---|
| `settings.section` | list | root | 一个设置页 = 一个条目 | general **0**、models **10**、plugins **15**、agent-presets **20** | none |
| `settings.general.item` | list | root | General 页里的一行偏好 | agent-preset **-25**、permission **-20**、language **0**、appearance **10**、composer-enter | none |
| `settings.plugins.tab` | list | root | Plugins 页里的一个标签页 | configurable **0**、all（inventory） | none |
| `settings.plugin.item` | list | root | configurable 标签页里的一张插件卡 | bash **0**、agent-loop **10**、web-search **20** | none |
| `settings.action` | list | root | 内容列头部、Close 之前的动作 | open-document **0** | none |
| `settings.onboarding` | list | root | 首次启动引导步骤（一次挂一个） | welcome-notice **-100**、deepseek-official **0** | none |
| `settings.trigger` | single | root | 侧栏底部触发行的图标+文字 | ui-settings-general `TriggerContent` | shadows |
| `settings.header` | single | root | 面板标题文字 | `HeaderContent` | shadows |
| `settings.close` | single | root | 关闭按钮的视觉隐藏标签文本 | `CloseLabel` | shadows |

`settings.section` 的 owner props 只给一个东西：

```ts
export interface SettingsSectionOwnerProps {
  /** Close the settings panel (the shell owns the open state). */
  close: () => void
}
```

`settings.general.item` 更极端 —— 文档写明 "the owner passes no props at all — copy, current value, and the write path are all yours, through your own inject face and `host.call`"。

### 1.3 会话 / 对话域

| key | kind | scope | 渲染什么 | 风险 |
|---|---|---|---|---|
| `conversation.session` | single | session | 一个会话的整个 body | shadows |
| `conversation.session.header` | single | session | 滚动区上方的条（标题、视图 tab、动作行） | shadows |
| `conversation.session.header.actions` | list | session | 标题旁的单个按钮（agent-preset **-10**、job-list、subagent-catalog） | none |
| `conversation.session.header.utilities` | list | session | 右对齐的会话工具区（session-log-download） | none |
| `conversation.view` | list | session | 视图环：一个 tab 一个条目（chat / trajectory） | none |
| `conversation.chat.node` | keyed | session | 按 `ChatConversationViewNode.kind` 分发的业务节点渲染器 | shadows |
| `conversation.chat.assistant-actions` | list | session | 单条已完成 assistant 消息的动作条（feedback **10**） | none |
| `conversation.chat.commandview` | keyed | session | 按命令名分发的命令行；**key 域开放，目前无人占用** | none |
| `conversation.chat.turnTail` | chain | session | 已完成 Turn 的扩展链（deliverables `ProducedFiles`） | none |
| `conversation.details.tool` | single | session | 详情面板里选中工具调用的 body | shadows |
| `tool.call.toolview` | keyed | session | 按 wire tool name 分发的工具调用卡（已占 16 个） | shadows |
| `tool.view.cordis` | keyed | session | `cordis_run` 卡内的交互区；**key 域开放，无人占用** | none |

`conversation.chat.node` 已占用的 key：`assistant-step, command, command-input, compaction, context, manual-compaction, model-retry, steering, tool-call, turn-error, turn-max-tokens, turn-tail, unknown, user, workflow-run`。

`tool.call.toolview` 已占用：`ask_user_question, bash, cordis_*, edit, glob, grep, read, skill, todo_write, web_fetch, web_search, write`。**未占用的工具名可以自由注册**——这是加自定义工具视图的官方路子。

### 1.4 输入区 / 空态

| key | kind | scope | 渲染什么 | 内置占位 | 风险 |
|---|---|---|---|---|---|
| `conversation.composer` | chain | session | composer 接管链（选择器路由的 InputBar 替换） | ApprovalPanel、SubagentReadOnlyComposer、QuestionComposer | none |
| `conversation.composer.bar` | single | session-maybe | 默认 composer 主体（链的 fallback） | `InputBar` | shadows |
| `conversation.composer.dock` | list | session | composer 卡片下方的一条带（内置 stats 行） | `StatsLine` | none |
| `conversation.input.dock` | list | session | composer 卡片上方的整行（queue / todo / goal） | 3 个 | none |
| `conversation.input.left` | list | session | 工具行左端，常驻 chrome 之后 | **空** | none |
| `conversation.input.right` | list | session | 工具行右端，send 按钮之前 | **空** | none |
| `conversation.input.model` | single | session | 模型选择器专座 | `ModelSelect` | shadows |
| `conversation.input.plan` | single | session | plan 状态专座 | `PlanChip` | shadows |
| `conversation.input.overlay` | list | session | InputBar 浮层锚点 | command-popup、slash-menu | none |
| `conversation.hero.workspace` | single | root | 空态的工作区选择器 | `WorkspacePicker` | shadows |
| `conversation.hero.workspace.directoryFlow` | single | root | 其下的目录流程洞 | directory-picker-* | shadows |
| `conversation.hero.agentPreset` | single | root | 新会话页工作区选择器旁的预设 chip | `AgentPresetSeat` | shadows |

**`conversation.input.left` 和 `conversation.input.right` 是空的**——想在输入框工具行加自己的按钮，这两个是零冲突的入口。

---

## 二、Idea C 可行性："更好地自定义页面内容"

### 2.1 slot 系统的三条硬规则（已验证，源码级）

**规则一：只能注册进"已声明"的 slot，声明来自已挂载的 owner。**

每个 slot 的 `declaredBy` 字段说明了这点，例如 `settings.general.item` 是 `"an entry in 'settings.section' (client-ui-settings-general)"`。文档明确：

> A slot exists only while the entry that declared it is mounted, and registering into an undeclared slot **throws**; `inject` runs your registration when the declaration is (or becomes) live and re-runs it if the owner remounts.

所以 `ctx.slots.inject(key, () => ctx.slots.register(...))` 这个两段式不是可选写法，是必须的。

**规则二：`single` / `keyed` 槽的抢占靠 `priority`，不是靠"后注册者赢"。**

`packages/client/ui-slots/src/index.ts` 的 `register` JSDoc：

> Shadowing (single/keyed/list): entries sharing one cell (single — the slot itself; keyed — same `key`; list — same `id`) coexist at distinct priorities, **sorted ascending with ties keeping registration order; the cell's lowest live entry renders**. A second registration at an occupied cell's exact priority (default 0) **throws naming the occupant**, so priority-less composition keeps the historical one-occupant-per-cell fail-loud.

也就是说：想替换 `conversation.input.model`，注册时带 `priority: -1` 就能赢。这是**官方支持的、有明确报错语义的**机制，不是 hack。

**规则三（最关键的坑）：抢占会级联摧毁子槽。**

> Lifecycle: the disposer removes the contribution AND **collapses every declared child slot** (child entries clear recursively; their stale disposers become no-ops) — one lifecycle axis, no dangling state.

举例：如果抢占 `sidebar.settings`，`ui-settings-general` 的 `SettingsRoot` 就不再渲染，而 `settings.trigger / header / action / close / section / onboarding` **全部是它声明的**——这六个槽连同 Models 页、Plugins 页、operating-context 页会一起消失。同理，抢占 `conversation` 会带走 composer、input、session 那一整族座位。

### 2.2 所以「能做什么 / 不能做什么」

**不用 fork 就能做的：**

- 加新设置页、新 General 行、新 Plugins 卡片 / 标签页（现在做的就是这个）
- 在会话头部、composer 工具行左右两侧、composer 上下方加控件（`input.left`/`input.right` 还是空的）
- 加全局浮层（`shell.overlay`，list，零冲突）
- 加自定义工具卡片（`tool.call.toolview` 未占用的 key）、自定义命令行视图（`conversation.chat.commandview` key 域完全开放）
- 加 assistant 消息的动作按钮、Turn 尾部扩展（chain 槽）
- **整块替换**某个单值面板（详情面板 body、模型选择器、plan chip、composer bar、会话头、侧栏工作区区域…）——用 `priority` 抢占，前提是接受"该槽声明的子槽全部消失"

**做不到 / 必须 fork 的：**

- **改内置组件的内部布局**。比如"把 Models 页的 provider 卡片改成两列"——`settings.section` 里 `models` 这个 cell 只能整体抢占，不能局部改。得自己重写整个 Models 页。
- **改消息列表内部结构 / markdown 渲染**。没有对应的 slot。
- **改侧栏会话列表的单行**。`sidebar.workspaces` 是 single，全有或全无。
- **靠 CSS 覆盖内置组件**。样式是 CSS Modules（类名哈希），没有稳定选择器可以钩。

### 2.3 样式 / 主题规则

`docs/web-styling.md` 的所有权划分：

> `ui-theme` owns the `--dsw-*` static scale, semantic aliases, typography, motion, gradients, shadows, scrollbar styles, and light/dark preference… **Feature packages consume semantic aliases and do not define another global theme.**

组件规则（原文要点）：

- 用 CSS Modules + `clsx`；**不要引入组件库或 Tailwind**
- feature 组件里只用 `--dsw-alias-*` 语义令牌，**不许抄静态调色板值、不许写字面颜色**
- **不许在 feature CSS 里写主题选择器**——明暗覆盖属于主题包
- 内联 React style 只能传组件局部自定义属性，**不能编码主题分支**

`packages/client/ui-theme/src/styles/design-platform.css` 共 **78 个 `--dsw-alias-*` 语义令牌**，分七族：

- 背景：`bg-base / bg-layer-1..3 / bg-mask-1..3 / bg-mask-drop / bg-mask-photo / bg-overlay / bg-skeleton / bg-module-platform / bg-multi-select`
- 边框：`border-l1..l4 / border-inverted / border-inverted2 / border-l2-darkmode-thin`
- 文字：`label-primary / label-secondary / label-tertiary / label-caption / label-dimmed / label-primary-dimmed / label-primary-inverted / label-primary-foreground / label-primary-bluish`
- 品牌：`brand-primary / brand-primary-invert / brand-text`
- 按钮：`button-primary-fill/hover/dimmed`、`button-ghost-active-*`、`button-tool-bar-*`、`button-elevated-fill`、`button-floating-*`、`button-contrast-fill`、`button-info-*`
- 交互态：`interactive-bg-hover / -active / -hover-accent / -hover-danger / -hover-solid`
- 状态：`state-error-primary/secondary`、`state-success-primary/secondary/tertiary`、`state-warn-primary/secondary/tertiary/label`、`state-business-primary/tertiary`
- 其他：`markdown-*`(9)、`scrollbar-bg-l1/l2`、`scrollbar-hover-l1/l2`、`toast-bg`、`tooltip-bg`

**做"主题定制"的官方口径很消极**（`ui-theme/README.md`，Known Limitations 段）：

> **Third-party themes are an extension point, not a product** — registering one means overriding same-named alias variables; **no validation exists that an override set is complete**.

即：换肤 = 覆盖同名 alias 变量，能做，但没有任何机制保证覆盖全了。

### 2.4 一个重要的分叉：正式插件包的能力比"动态包"强得多

`slot-catalog.ts` 里的 `CLIENT_NOTES` 有一条限制：

> You cannot `import` anything, so the design-system components are out of reach: build markup with `React.createElement` and ship CSS through `styles.insert(css)`.

这条**只适用于动态 Cordis 包的 browser half**。`dsh-operating-context` 是一个正经的 npm 包，有 `dsh.client` 声明 + `cordis.patch.yml` Loader 行，peerDependencies 里已经有 `dsh-client-ui-primitives`、`dsh-client-schema-form`、`dsh-client-web-react`——**可以直接 import 设计系统组件和写 CSS Modules**。这对 Idea C 是决定性的：能做出和内置页面视觉完全一致的 UI，而不是手搓 `createElement`。

同一段还有一条对正式插件包不适用的：

> Do NOT pass `priority`: the browser-half facade assigns one automatically, and it is LOWER than every shipped entry.

真正的客户端插件包**可以**显式传 `priority`——这正是抢占内置槽的手段。

---

## 三、Idea D 可行性："支持填写多个 API key"

### 3.1 今天凭据是怎么存、怎么取的

**存储模型：配置里只放引用，值在别处。**（`docs/subsystems/credentials.md`）

> A reference names one credential as a POSIX-style environment-variable name.

```ts
type CredentialRef = Branded<'CredentialRef'> // 一个 POSIX 环境变量名
interface ResolvedCredential { value: string; source: string }
interface CredentialInfo { configured: boolean; source?: string; writable: boolean }
```

seam 只有四个操作：`resolve` / `describe` / `set` / `unset`。**注意 `describe` 只答"配没配、来自哪层、能不能写"，永远不返回值。**

`credentials-local` 的四层优先级（README 表格）：

| 层 | source id | 可写 | 何时赢 |
|---|---|---|---|
| 继承的进程环境 | `env` | 否 | **总是赢** |
| `$DSH_HOME/.credentials.yaml` | `file` | **是**（`set`/`unset`） | 赢过两个 `.env` |
| `<project>/.env` | `project-env` | 否 | 赢过用户 `.env` |
| `$DSH_HOME/.env` | `user-env` | 否 | 兜底 |

文档格式就是一个扁平 YAML map，没有版本号、没有包装层：

```yaml
DEEPSEEK_API_KEY: sk-…
OPENAI_API_KEY: sk-…
```

**适配器怎么取 key（`packages/llm/llm-deepseek/src/index.ts`，已核实源码）：**

```ts
const resolveApiKey = async (connection: ResolvedDeepSeekOptions): Promise<string> => {
  const ref = connection.apiKeyEnv // 单个引用，来自 config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(ref)
    if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-deepseek', ref)
  } else { /* 回落到启动环境快照 */ }
  throw new LlmError(`llm-deepseek: no API key for provider route "${PROVIDER}"…`, 'MISSING_CREDENTIAL')
}
```

`Config` 里 `apiKeyEnv` 是**一个 string**，不是数组：

```ts
apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
```

Web UI 侧同理（`ui-settings-models/src/client/store.ts`）：

```ts
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}
```

一个 provider route → 一个派生引用名 → 一个值。`ProviderRow` 里 `apiKeyEnv: string | undefined`、`credential: CredentialView | undefined`，都是单数。

### 3.2 现有多 key / 轮换支持：**零**

逐个排查：

- **凭据 seam**：无。README 的 Known Limitations 明确写 "**No enumeration** — the seam answers questions about references it is given"，连"列出所有 key"都没有，更别说轮换。
- **`llm-deepseek`**：无。单 `apiKeyEnv` 字段。
- **`llm-pi-ai`**：无。README 原话："**One credential serves every model on its route.**"
- **`llm-retry`**：只做退避重试，**同一个 route、同一个 key**。默认对 `EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT` 重试两次。它不换 key。
- **Models 设置页**：每张 provider 卡一个 key 输入框，写入走 `credentials.set({ ref, value })`。

唯一"接近"的东西是 `llm-pi-ai` 的多 route 能力——但那是不同 provider ID，不是同一 provider 的多 key。

### 3.3 三条可行路径，以及为什么必须有 Host 侧插件

**路径 A：多 provider route（纯配置，无需插件，但不是"轮换"）**

`llm-pi-ai` 的 `providers` 是一个 dict，可以写：

```yaml
llm-pi-ai:
  providers:
    deepseek-a:
      apiKeyEnv: DEEPSEEK_API_KEY_A
      api: openai-completions
      baseURL: https://api.deepseek.com/v1
      models: [{ id: deepseek-v4-pro }]
    deepseek-b:
      apiKeyEnv: DEEPSEEK_API_KEY_B
      api: openai-completions
      baseURL: https://api.deepseek.com/v1
      models: [{ id: deepseek-v4-pro }]
```

README 里明确把"拆成两个 route key"列为 workaround（针对协议问题，但机制通用）。**问题**：模型选择器会出现两个 provider，用户得手动切；没有任何自动轮换或故障转移。这只是"能存多个 key"，不是想要的东西。

**路径 B：替换 `ctx.credentials` 实现（最干净）**

`ctx.credentials` 在 `docs/capability-seams.md` 里被标为 `seam`，owner 是 `credentials`，implementation 是 `credentials-local`——**这是可替换位**。关键在于凭据文档里这句（已验证，重复出现三次）：

> Consumers re-resolve at each operation and **never cache across operations** — that per-operation read is the hot-update mechanism.

也就是说：**一个自己实现的 `CredentialProvider`，只要每次 `resolve(ref)` 返回池子里的下一个 key，所有 LLM 适配器就自动获得了轮换，一行适配器代码都不用改。** 这是这个架构送上门的钩子。

实现形态：一个 Host 侧插件，包装（委托）`credentials-local`，对自己管理的引用名做池化+轮换，其余引用直接透传。前端则是一个 `settings.section` 页面，管理"哪些引用属于哪个池"（存自己的 settings namespace），并用官方 `credentials.set` RPC 逐个写 key。

**注意点（部分为推断）**：

- 一个 context 里应该只能有一个 `ctx.credentials` 提供者，所以这需要 composition 层面的改动。插件已经带 `cordis.patch.yml`，理论上可以 patch 掉 `credentials-local` 行——但**未验证 patch 的 replace/remove 语义**，这需要实测。
- `set` 的遮蔽规则要遵守：进程环境层供给该引用时 `writable: false`，`set` 必须拒绝。
- "空值即不存在"是 seam 级铁律，实现必须遵守。

**路径 C：`agent/request` / `agent/request-error` 波形钩子（做故障转移）**

`docs/subsystems/llm-streaming.md`：

> `agent/request` receives a frozen call-config seed and **may return a replacement to switch provider, model, reasoning effort, or sampling**.

> the agent loop closes the failed step and offers the error, facts, immutable prior-retried facts, serving policy, and turn signal to `agent/request-error`. **A handling listener returns `{ kind: 'retry' }` after its awaited repair.**

配合路径 A 的多 route：在 `agent/request` 里轮流把 `provider` 换成 `deepseek-a` / `deepseek-b`；或在 `agent/request-error` 收到 `RATE_LIMIT` 时切到下一个 route 再返回 `retry`。这也是 Host 侧插件。

**路径 C 有个真实成本**：`llm-pi-ai` README 的 KV Cache 段写着 "Changing adapter instance, **provider**, model, or any upstream request token may prevent reuse from the first difference"。每轮换一次 provider route，provider 侧的前缀缓存就断一次，输入 token 计费会显著上升。路径 B（同 route 换 key）没有这个 provider 标识变化，但不同 API key 在服务商侧通常也是不同缓存桶——这点需要按实际 provider 验证。

### 3.4 明确回答：需不需要 Host 侧插件？

**需要。纯"设置页 + adapter config"做不到。**

理由是三段闭合的：

1. 前端能做的极限是通过 `credentials.set` 写入 N 个引用、通过 `settings.mutate` 写入 N 个 route profile。这两个 RPC 都存在、都可用。
2. 但**选哪个 key 的决策发生在 Host 进程内的 `resolveApiKey`**，那是适配器 `stream()` 调用链里的一步，浏览器碰不到。
3. adapter config 的 schema 里没有任何多值字段可以承载"key 列表"——`apiKeyEnv` 是 `z.string()`。改 schema 就是改 upstream 包。

所以最小可行形态是：**Host 半 + Client 半的双半插件**。Host 半做轮换（路径 B 或 C），Client 半做管理 UI（一个 `settings.section` 页 + 可能一张 `settings.plugin.item` 卡）。现有的 `dsh-operating-context` 是纯 browser-only（`apply()` 空实现），Idea D 会是第一个真正需要 Host 逻辑的插件。

---

## 四、风险与阻塞

### Idea C

| 风险 | 严重度 | 说明 |
|---|---|---|
| **抢占单值槽的级联摧毁** | 高 | 抢占任何 `shadows-shipped-ui` 的 single 槽，会连带 collapse 它声明的所有子槽——包括别的第三方插件的座位。这是"我的插件把别人的插件搞没了"级别的问题 |
| **slot 目录是编译期契约，不是运行期承诺** | 中 | 官方注释："a key is registrable only where the owner that declares it is mounted"。用户换了 composition（比如没装 ui-settings-plugins），`settings.plugins.tab` 就不存在 |
| **内置组件无稳定 CSS 钩子** | 中 | CSS Modules 哈希类名。想"微调内置页面样式"基本没戏，只能整体替换 |
| **slot 目录本身会变** | 中 | 生成物，upstream 加删 slot 不算 breaking change。`order: 12` 也可能哪天被官方新页面占掉（虽然 order 冲突不报错，只是排序变化） |
| **深度定制的真实边界** | 中 | 42 个槽听着多，但覆盖的是"座位"不是"结构"。"让消息气泡变成卡片式""侧栏会话分组改成看板"这类需求，slot 系统给不了 |
| 组件渲染崩溃会 abdicate | 低 | 有 `ctx.slots.onEntryError` 监督接口，错误边界会把崩溃条目从 cell 里退役——降级行为是明确的，算优点 |

### Idea D

| 风险 | 严重度 | 说明 |
|---|---|---|
| **必须动 composition 才能替换 `ctx.credentials`** | 高 | 路径 B 依赖能把 `credentials-local` 换成包装实现。`cordis.patch.yml` 能不能干这事**未验证**，这是第一个要打通的技术点 |
| **凭据 seam 无枚举能力** | 高 | "No enumeration — … a `list()` has no current consumer"。插件必须自己维护"哪些引用名属于哪个池"的注册表（存自己的 settings namespace） |
| **`llm-deepseek` 官方路由绕不开** | 高 | 它的 `apiKeyEnv` 是单值 string，路径 A/C 对它无效。要么走路径 B，要么让用户改用 `llm-pi-ai` 的 `deepseek` catalog route——后者是产品体验的倒退 |
| **KV cache / 前缀缓存断裂** | 中高 | 路径 C 每次换 provider route 都会打断缓存复用，输入 token 成本上升。路径 B 更安全但取决于服务商是否按 key 分缓存桶 |
| **和 `llm-retry` 的波形顺序** | 中 | `llm-retry` README："**Recovery policies compose by waterfall order** — always mode accepts a downstream retry before applying its fallback." 两个 recovery 插件都监听 `agent/request-error`，谁先谁后会改变行为；且 "Finite plugin budgets add"，重试预算会叠加 |
| **进程环境遮蔽** | 中 | 用户如果 export 了 `DEEPSEEK_API_KEY`，`credentials-local` 报 `writable: false`，`set` 直接拒。多 key UI 必须对每个引用先 `describe` 再决定是否渲染成只读 |
| **`.credentials.yaml` 权限校验** | 低 | POSIX 上任何 group/other 权限位都会导致启动失败。新增引用不改这一点，但要在文档里提醒用户 |
| **同引用并发写是 last-write-wins** | 低 | credentials-local Known Limitations 有写；批量保存 N 个 key 时要串行 |

### 一个跨两者的共性风险

这个仓库的文档是**从源码生成 + doc-sync 校验**的（`gen-client-catalog.ts`、`gen-cordis-catalog.ts`、`verify-*`）。好处是引用的东西准确度很高；坏处是 upstream 重构时这些契约会跟着变，而它们**不在语义化版本的保护范围内**——`slot-catalog.ts` 的注释自己说了它是 "the COMPILE-TIME contract of the shipped web bundle, not a snapshot of one page"。两个插件都应该做防御性设计：注册失败要能读到 browser-half load report（`cordis_inspect what:"temporary"`），Host 侧 seam 缺失要能优雅降级而不是崩启动。

---

**验证状态说明**：slot 名单、kind/scope、内置占位、order 值、priority 抢占语义、凭据四操作、`llm-deepseek` 的 `resolveApiKey`、`deriveKeyRef`、78 个主题令牌——**全部读源码或生成物核实**。`cordis.patch.yml` 能否替换 `credentials-local`、`agent/request` 换 provider 后模型选择器的显示行为、不同 API key 对服务商前缀缓存的实际影响——**推断，需实测**。

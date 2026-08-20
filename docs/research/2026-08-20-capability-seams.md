# 调研存档：dsh 扩展缝地图 + 两个功能想法的可行性

> 存档日期：2026-08-20
> 来源：`AIMFllyYS/deepseek-harness` 的 `docs/capability-seams.md`、`docs/architecture.md`、`docs/subsystems/*`、`.agents/notes/*`
> 状态：**原样存档，未经删改**。这是「硬性上下文机制」和「更多思考模式」两个想法的技术底稿，真要动手时直接用，不必重新调研。

> 说明：下文标 **【已核实】** 的是文档原文可直接支撑的；标 **【推断】** 的是基于架构规则的推理，未在文档中直接读到。

---

## 0. 一句话结论

| 想法 | 结论 | 是否需要改核心 |
|---|---|---|
| A 硬性上下文机制 | **完全可行**，官方已有三档强度的缝，且有现成参考实现 | 否 |
| B 更多思考模式 | **拆两半**：加"行为模式"可行且有模板；加"思考强度档位"会撞 adapter 所有权墙 | 行为模式否；新档位需写 adapter |

---

## 1. 官方扩展缝地图

### 1.1 总原则

`architecture.md` 开宗明义：

> Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the agent loop itself, so every part is replaceable from configuration.
>
> **There is no privileged core to patch**: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads.

一个"seam（缝）"的正式定义有三个角色（`glossary.md`）：**Service Definition**（拥有 `ctx.*` 键的抽象类/注册表）、**Service Provider**（实现）、**Consumer**（消费者，常是面向模型的工具）。三者缺一不成缝。

### 1.2 事件域分三类（`architecture.md`）

- **Session events** — 追加进日志的持久事实，经 `session/event` 广播。**事实必须在重载后存活时用它**。
- **Agent events（`agent/*`）** — 携带活的 `Agent`：inbox、step、status、request、validation、continuation。**观察或拦截进行中的工作时用它**。
- **Capability events** — 把策略和适配器挂到某个缝上（`fs/*`、`tools/*`、`telemetry/*`），无需 import loop。

其中 **waterfall（可拦截/可改写）** 的只有这几个：`agent/pre-step`、`agent/request`、`llm/stream`、三个 `tools/*`、`system-prompt/assemble`、`approval/request`。`agent/turn-stopping` 是 serial，**没有 `next()`**。

### 1.3 官方扩展点表（`architecture.md` "Where new behavior goes" 原表）

| 目标 | 机制 | 侧 |
|---|---|---|
| 加模型 provider | 在 `ctx.llm` 注册 adapter | Host |
| 加面向模型的能力 | 在 `ctx.tools` 注册；其 schema 自动进 prompt assembly | Host |
| 给单个 session 不同的能力集 | 组装 agent preset；该处的 service row 需 `isolate` realm | Host |
| 加 shell 执行 | 注册 `ctx.shell` 后端 | Host |
| 加持久终端 | 注册 `ctx.terminals` 后端 + `dsh-tool-terminal` | Host |
| **加人类命令** | 在 `ctx.commands` 注册；**不经过模型轮次**直接派发 | Host |
| 加后台工作 | 在 `ctx.jobs` 注册；`job_*` 工具收集/停止 | Host |
| 加文件系统访问或策略 | 注册 `ctx.fs` provider 或监听 `fs/*` | Host |
| 限制子进程 | 用 `ctx.sandbox` 后端 | Host |
| **拦截 request / tool / turn** | 用对应 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 可停轮次 | Host |
| **加面向模型的上下文** | 调 `agent.inject()`；落在下一次被采纳的 request 里 | Host |
| 加 UI 或编辑器集成 | 驱动 `ctx.agents`，从 `session/event` 渲染 | Client |
| **加 Web Client Chat 节点** | 注册 `ConversationNodeDefinition` + keyed renderer | Client |
| **加持久 session 状态** | 扩展 `SessionEventMap`；从日志渲染与重放 | Host |
| 生成 session 标题 | 注册唯一的 `ctx.sessionTitle` provider | Host |
| 管理同 session 目标 | 用 `ctx.goals`；经 `agent/*` 续跑 | Host |
| fork 活 session | `ctx.sessions.fork(source, boundary?, childSessionId?)` | Host |
| **把注册限定到单个 agent** | 用该 agent 的 `agent.ctx` | Host |

### 1.4 与两个想法直接相关的缝（摘自 `capability-seams.md` 全表，共约 50 个 `ctx.*`）

**Host 侧：**

| ctx 键 | 角色 | Owner 包 | 相关性 |
|---|---|---|---|
| `ctx.systemPrompt` | core | `core/system-prompt` | **Idea A 主力** |
| `ctx.sessions` | core | `core/session` | 日志真源 |
| `ctx.compaction` | **seam** | `compaction/compaction`（实现 `compaction-basic`） | Idea A 的对手 |
| `ctx.toolResultPruner` | core | `compaction-tool-result-pruner` | 压缩前置 |
| `ctx.tokenMeter` | core | `llm/token-meter` | 压力测量 |
| `ctx.llm` | **seam** | `llm/llm`（实现 `llm-deepseek` / `llm-pi-ai` / `llm-replay`） | **Idea B 主力** |
| `ctx.planMode` | core | `plan/plan-mode` | **Idea B 的模板** |
| `ctx.commands` | core | `interaction/commands` | 模式切换命令 |
| `ctx.skills` | **seam** | `skill/skill` | 另一种上下文注入 |
| `ctx.agentPresets` | core | `preset/agent-presets` | 重型"模式" |
| `ctx.permissionPresets` | core | `interaction/permission-presets` | preset 表先例 |
| `ctx.agentDefaultModel` | core | `core/agent-default-model` | 默认 `ModelSelection` |
| `ctx.subagents` | **seam** | `subagent/subagent`（6 个 provider） | 委派 |
| `ctx.settings` | **seam** | `settings/settings` | 用户设置分层 |

**客户端侧：**

| 机制 | 说明 |
|---|---|
| `dsh.client` 声明 + `ctx.clientModules` | 浏览器插件表，组装 `__DSH_BOOT__` 入口图 |
| `ConversationNodeDefinition` + keyed renderer | 新增 Chat 节点类型 |
| `ctx.commandUi` | 注册 `/xxx` 的 popupSelect 之类交互 |
| `ctx.conversation.blocks` | 拉起 composer 阻塞态 |
| 命名 seat（如 `conversation.input.model`） | 往 composer 指定位置插 UI |
| `ctx.modelDirectories` | **Idea B 的 UI 落点** |

**两侧都有：** `ctx.dynamicCordisRunner`（`extensions.md`）——运行时定义版本化的动态 Cordis Plugin/Package，**每个 Package 有 Host 半边和 Client 半边**，Client 半边需审批（`cordis/request-run` → 审批 → `runHostHalf` / `getClientCode`）。这是"不重启进程装插件"的通道。

---

## 2. Idea A —— 硬性上下文机制

### 2.1 先搞清楚 compaction 到底动什么

**【已核实】**（`compaction.md`）压缩只作用于 **session surface**，不作用于 system prompt：

> All three are **log-only** — they record the lock, summary, selected range, shadowed event seqs, token count, and model call **without joining the surface**. `SurfaceEventType` is deliberately NOT extended (only message-producing events reach the model), so the summary itself rides on a separate `user/message` with `surfaceOp: { op: 'replace', start, end }` — **the only surface mutation performed by summary compaction**.

也就是说压缩的全部效果是：把一段 surface 节点用一条 `user/message` 替换掉，被 shadow 的节点从 `deriveMessages()` 的投影里消失。触发点在 `agent/pre-step`（pressure）和 `agent/request-error`（canonical overflow）。

**关键推论：只有走 session surface 的内容才会被压缩碰到。** system prompt 是每个 step 重新 assemble 的，压根不在 surface 上。

### 2.2 三档注入强度（按"硬度"排序）

#### 第一档（最硬）：`ctx.systemPrompt.section()` — PromptSection

```ts
interface PromptSection {
  readonly name: string
  readonly order: number          // -100 harness identity, 0 deployment persona, 100–199 tool guidance
  readonly text: string | ((context: AssembleContext) => string)
  readonly complete?: boolean     // 成为唯一的 system prompt
}
```

**为什么它是"硬"的**：`agent-loop/README.md` 明确说每步都重发——

> For each step, the loop sends the rendered per-agent system prompt, visible tool schemas, and the session's derived messages.
> **System text and schemas are paid again on every step.**

**【推断】** 因此 PromptSection 在结构上对压缩免疫：它既不是 `SurfaceEventType`，也不参与 `deriveMessages()`，`compactRegion` / `compactIfNeeded` 无从触及。这是真正意义上的 "pinned / 永不掉落"。代价是每个 step 都付一次 token。

作用域：`agent.ctx` 注册即 per-agent，且同名 scoped section **shadow** 全局同名 section（`README.md`："A scoped section shadows a global section with the same name"）。

`complete: true` 是核武器：

> Treat this contribution as the complete system prompt. Assembly still runs the cooperative waterfall so tools, contexts, and variables can be resolved, then **restores this exact section as the sole prompt section**. More than one effective complete section makes assembly fail.

#### 第二档：`ctx.systemPrompt.context()` — PromptContext

这是**文档里唯一明确写出"抗压缩重投"保证**的机制（`system-prompt.md`）：

> `PromptContext` is the cache-safe counterpart to `PromptSection`. The assembly resolves and orders these contributions, while **agent-loop logs their complete current snapshot after retained model history only when it changed or compaction removed it**.

```ts
interface PromptContext {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: AssembleContext) => string)
}
```

它落地成 durable 的 user-role 快照消息（`MessageSource` 带 `form: 'snapshot'` + `sections`）。**agent-loop 自己负责在压缩抹掉它之后补投**——这正是"硬性上下文"想要的语义，而且不用自己写重投逻辑。

比 PromptSection 省 token（只在变化或被压掉时重发，可复用 KV cache），但它在 conversation 里的位置是"retained model history 之后"，权威性弱于 system slot。

#### 第三档（最软）：`agent.inject()`

```ts
inject(message: UserMessage): void
```

> Queue model-facing context for the next pre-step **without waking the driver**. A running driver claims it at the nearest later step boundary; **idle drivers leave it pending until follow-up or steering wakes them. It may miss a request whose pre-step already claimed its batch.** Cancellation or disposal may discard pending context.

它变成普通 `user/message` 进 surface，**会被压缩 shadow**，要"硬"必须自己实现重投。

### 2.3 现成参考实现：`@deepseek-ai/dsh-agent-instructions`

这就是 dsh 自己的 AGENTS.md 加载器，**Idea A 想要的东西官方已经做了一遍**，可以直接抄或直接配置。

它对压缩的处理写得很明确：

> **Compaction re-arms a scope after its context event leaves the visible surface** even when the cached version is unchanged.

> The initial baseline event itself is not rewritten. Its typed changes remain authoritative only while that event is in the visible session surface. **When compaction shadows the event, the next entering pre-step composes the current baseline and records it in the same request.**

机制拆解（可直接复用的套路）：
1. **prepend 一个 `agent/pre-step` listener**，先 `next()` 委派下游，下游决定 `enter` 时把 baseline 折进最终 batch，**紧跟在被 claim 的 prompt 之后**；
2. 被 reject 就把内容留在 `next-step` inbox 等下次唤醒；
3. 状态**不藏在模型可见文本里**，而是放在 typed `MessageSource` 上（`{ action, scope, path, digest? }` + `baseline: true` + `baselineIdentity`），所以 resume 后能重建；
4. 用 SHA-1 digest 去重，"An unchanged path and SHA-1 content digest is not injected again"。

Prompt 形状（可直接照抄的框）：

```md
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md
...
</system-reminder>
```

配置项（`Config`）：`dshHome`、`projectRootMarkers`（默认 `['.git']`）、`maxBytes`（**必填**，强制部署方显式做 prompt 预算决策）、`maxSourceBytes`（默认 1 MiB）、`instructionFileCandidates`（默认 `['AGENTS.md', 'CLAUDE.md']`）、`localInstructionFileCandidates`（默认 `['AGENTS.local.md', 'CLAUDE.local.md']`）。

**所以如果只是想要"项目规则文件常驻"，改 `instructionFileCandidates` 配置就够了，连插件都不用写。**

### 2.4 Idea A 的推荐方案

| 想要的 | 用哪个缝 |
|---|---|
| 真·永不掉落的置顶指令块 | `ctx.systemPrompt.section({ name, order, text })`，用 `agent.ctx` 做 per-session |
| 项目规则 / AGENTS.md 类 | 直接配 `dsh-agent-instructions`，或抄它的 `agent/pre-step` prepend + typed source + digest 套路 |
| 会变的状态型上下文（省 token） | `ctx.systemPrompt.context()`，loop 自动在压缩后补投 |
| 需要在日志里留痕的一次性上下文 | `agent.inject()` |

---

## 3. Idea B —— 更多思考模式

### 3.1 现状：thinking / reasoning 是怎么建模的

**内容层**（`llm-streaming.md`）：`ContentBlockMap` 里有 `'reasoning': ReasoningBlock`（"thinking, distinct from visible text"），流协议里有 `{ type: 'reasoning-delta'; index; text }`。UI 侧有 `packages/client/ui-conversation/src/client/chat/ReasoningRow.tsx`。

**强度层**——这是重点，且**是 adapter 私有的**：

```ts
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

> Reasoning effort is another exact-route capability. **The core brands identifiers but does not enumerate their values; each adapter owns the ordered set, display names, and optional deployment default.**

```ts
interface LlmModelReasoningInfo {
  efforts: readonly LlmReasoningEffortInfo[]   // { id, name, description? }
  defaultEffort?: ReasoningEffortId
}
interface LlmResolvedModelInfo extends LlmModelInfo {
  context?: LlmModelContext
  defaultMaxTokens?: number
  reasoning?: LlmModelReasoningInfo
}
```

档位通过 `LlmAdapter.resolveModel(provider, model, signal?)` 逐"精确路由"（provider × model）解析出来。请求侧：`GenerateOptions.reasoningEffort` 和 `LlmCallConfig.reasoningEffort`。

**是否 per-adapter？是的，而且是刻意的。** 设计记录 `2026-07-24-adapter-owned-reasoning-effort-capabilities.md`：

> 原生 DeepSeek adapter 在部署策略允许 thinking 时 advertise **`off`、`high`、`max`**，默认取配置值或 `high`。它自己的 `off` 映射到 `thinking.type: disabled` 且不带 `reasoning_effort`。pi-ai adapter 原样发布每个模型的 `getSupportedThinkingLevels()` 结果。

被明确**拒绝**的替代方案（这几条直接决定了插件能做什么）：

> **Define the pi-ai `ThinkingLevel` union in core.** Rejected...
> **Carry an untyped provider options object.** Rejected because the loop could neither validate a selected value nor put a stable provider-neutral fact in the request header.
> **Clamp unsupported levels.** Rejected because a silent substitution makes the user's selected control differ from the logged request intent.
> **Normalize every adapter to a core-owned level list or remove `off`.** Rejected because the selectable vocabulary belongs to the exact model capability.

失败模式：`UNSUPPORTED_REASONING_EFFORT`，**在 provider I/O 之前**就拒，不 clamp 不 alias。

### 3.2 插件能在哪里改 reasoning

**每个 step 都可以换**，通过 `agent/request` waterfall：

```ts
'agent/request'(this: Scoped<Agent>, payload: { agent, turn, step, signal },
                next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>
```

> Replace the frozen call configuration. `await next()` yields the config the machine would use (agent options on the first request, the logged header afterwards); **return a replacement to switch**. Model-visible content must use logged channels; **this waterfall cannot mutate messages**.

`LlmCallConfig` 可换的字段：`provider`、`model`、`reasoningEffort`、`temperature`、`maxTokens`、`stop`。

有效配置会落进 `request/header` 的 `EpochHeader.config`，并用 `adapterDefaults` 标记哪些字段是 adapter 补的。loop 在 waterfall **之前**会把标记为 adapter default 的字段摘掉，让新路由重新物化自己的默认值。

### 3.3 UI 选择器在哪

**包：`packages/client/ui-model-selection`**（`@deepseek-ai/dsh-client-ui-model-selection`，纯浏览器半边）。

> TWO entries over ONE per-session directory owned by `ModelDirectoryResolver` (`ctx.modelDirectories`). For ordinary sessions, the **`/model` popupSelect** contribution (registered through `ctx.commandUi`) and the composer's named **`conversation.input.model` seat** both load the session's advisory directory through `session.models` and submit through `session.selectModel`.
>
> The compact composer trigger opens a **two-level Model/Effort menu**: models stay provider-grouped, while the selected exact model supplies its **adapter-owned effort names, descriptions, and default**. `/model` applies the selected model's default effort, and the composer can then choose any advertised effort.

相关 RPC：`session.models`、`session.selectModel`、`session.models.routable`（不可路由时通过 `ctx.conversation.blocks` 让 composer 失效）。

默认选择的 Host 侧归属：`ctx.agentDefaultModel`（`currentSelection()` / `saveSelection(next: ModelSelection)`），经 `ctx.settings` 分层。

刷新触发：`llm/adapters-updated` 和 `settings/document-updated`。

**明确的限制**：

> **No arbitrary effort input** — the composer offers only the exact model's adapter-advertised levels; an adapter without reasoning metadata leaves the Effort row absent.

### 3.4 拆成两个子问题

#### B-1「加新的思考强度档位」——会撞墙

想给现有 DeepSeek 模型加一个 `off/high/max` 之外的档位，**插件做不到**。档位集合是 adapter 通过 `resolveModel()` 独家 advertise 的，没有任何注册表允许第三方往别人的 adapter 里塞档位，且 core 对不认识的 id 直接硬失败。

可选出路：

1. **写自己的 `LlmAdapter`**（`ctx.llm.registerAdapter(providers, adapter)`）。这**仍然是纯插件**，不算改核心——`ctx.llm` 就是官方的 provider 缝。代价是要自己实现 `stream()` 和整条 wire 协议。
2. **【推断】代理 adapter**：注册一个新 provider route（如 `deepseek-modes`），内部转发到底层 provider，但在自己的 `resolveModel()` 里 advertise 扩展档位集合，并在 `stream()` 里把自定义 id 映射回底层认识的值 + 附加 prompt/参数。文档没有描述这个模式，但 adapter 契约（只有 `stream()` 是必需方法，catalog 是 advisory）不禁止它。风险是 `AssistantProvenance.replayState` 只在"同一 adapter 实例同时拥有历史 provider 和目标 provider"时才传递。
3. **不要试图用 `llm/stream` waterfall 改**——loop 造的 request 是 deep-frozen 的：

> A LOOP-built request carries the process-local `markAgentLoopRequest` identity and **arrives deep-frozen (mutation throws)**: its content is a pure function of the session log, so **listeners read it, never rewrite it**.

#### B-2「加自定义行为模式」——完全可行，有逐行可抄的模板

**`dsh-plan-mode`（`ctx.planMode`）就是官方的"自定义模式"参考实现**，它是可选包，"the agent loop does not depend on it"。整套配方：

| 组成 | plan-mode 的做法 |
|---|---|
| 持久状态 | declaration-merge 一个 log-only session event `plan/mode`：`{ active: boolean }`，整值替换 |
| 状态恢复 | `foldPlanMode(events, end?)` 纯 fold。"the state in force is always a pure fold of the session log, so **resume, fork, and compaction recover it with no live mirror**" |
| 影响模型 | 激活时贡献 `plan:policy` prompt section，**order 50**；未激活贡献空文本 |
| 文案归属 | `PlanModeConfig { section: string }`，部署方拥有；缺失/空/非字符串**在插件加载时就失败** |
| 人类入口 | 通过 `ctx.commands` 注册 `/plan [off\|message]`；带参数时先切模式再 `agent.steer()` 提交文本 |
| 模型出口 | `exit_plan_mode` 工具**常驻注册**——"entering or leaving plan mode changes only the prompt section, never the request tool catalog" |
| 提交时机 | prepend 一个 `agent/pre-step` listener，先调下游，**下游接受后**才 append |
| UI 观察 | "UIs observe committed flips through `session/event`; there is no live mirror" |
| 状态查询 | `get(agent) → { active, pending? }`；`set(agent, active) → 'committed' \| 'queued' \| 'cancelled' \| 'noop'` |

一句很重要的定性：

> **Plan mode is soft guidance.** Sandbox mode and approval policy enforce restrictions independently; neither reads or writes plan state.

**把 B-1 和 B-2 组合起来**就是真正想要的"think harder 选择器"：**【推断】** 一个模式插件同时 (a) 按 plan-mode 配方管理模式状态，(b) 在模式激活时注册对应的 prompt section，(c) 在 `agent/request` waterfall 里把 `reasoningEffort` 换成该模式对应的档位（**只能从当前模型已 advertise 的档位里选**）。这样不写 adapter 也能得到"模式 → 思考强度"的联动。

**重型选项**：`ctx.agentPresets` 是"整套换"的模式——每个 preset 是一个目录 + `cordis.yml`，`mount(agentCtx, id)` 在 agent 创建时挂载，`recompose(agentCtx, id)` 可重新链接（但**只在 agent 尚未产出任何东西时有效**："swapping tools mid conversation would leave logged tool calls the new composition cannot make"）。适合"研究模式 / 编码模式"这种要换整套工具+prompt 的场景。`ctx.permissionPresets` 是同类 preset 表的另一个先例（`workspace-write` / `danger-full-access`，写一个 `permission/preset` 事件带动两个 knob）。

---

## 4. 风险与阻塞

### 4.1 Idea A

| 风险 | 说明 | 严重度 |
|---|---|---|
| `complete` section 冲突 | 多于一个生效的 complete section 会让整个 assembly 失败 | 中 |
| waterfall 改不了 complete prompt | "A registered complete section is restored after this waterfall, so **listeners cannot add to or replace that scope's system prompt**" | 中 |
| 变量插值极严格 | 未知引用、已注册但无值、畸形 `{{…}}` 组都 **throw**；且**没有转义语法**（"No escape syntax for literal `{{…}}` braces"）。指令内容里出现 `{{` 会炸 | **高** |
| 运行时上下文可被全局关掉 | `includeRuntimeContext: false` 或任一 `suppressRuntimeContext()` 会干掉**所有** PromptContext，**包括 waterfall listener 加的**。第三方插件可以静默废掉你的上下文 | **高** |
| 无终端用户 prompt 编辑 API | "Deployment-authored prompt text is **config/composition only**… there is no end-user prompt-editing API"。想让用户在 UI 里编辑置顶指令，需要自建设置面板 + `ctx.settings` namespace | 中 |
| `agent.inject()` 不唤醒 | idle 时会一直挂着；也可能错过已经 claim 过 batch 的 request | 中 |
| KV cache 失效 | system prompt 一变，"may invalidate reuse from the first changed system-prompt token" | 低 |
| 压缩救不了超大单元 | "**A single oversized retained unit or request envelope cannot be repaired through surface compaction.**" 硬性上下文本身太大会把 session 推进死胡同 | 中 |
| 同 order 并列不确定 | "Sections sharing an `order` value tie-break by registration order — a plugin-load artifact" | 低 |

**结论：Idea A 无需 patch core。** 三条缝（`section` / `context` / `inject`）都是公开注册 API，`dsh-agent-instructions` 证明了完整场景可以纯插件实现。

### 4.2 Idea B

| 风险 | 说明 | 严重度 |
|---|---|---|
| **档位由 adapter 独家拥有** | 无法从外部扩展现有 adapter 的 effort 集合。加新档位 = 注册新 adapter route | **阻塞级**（针对 B-1） |
| 不 clamp、硬失败 | `UNSUPPORTED_REASONING_EFFORT` 在 provider I/O 前拒绝。模式插件必须先 `resolveModelInfo()` 确认档位存在再提交 | **高** |
| UI 只显示 advertise 的 | "No arbitrary effort input"。想在现有 composer 里加自定义档位，得改 `ui-model-selection` 或自己占一个 seat | 中 |
| loop request 冻结 | `llm/stream` 拿到的 loop-built request deep-frozen，改不了。唯一的 config 改写点是 `agent/request` | 中 |
| `agent/request` 不能改消息 | "this waterfall cannot mutate messages"。模式的提示词必须走 prompt section 或 `inject()` | 低 |
| resume 换路由丢档位 | "A resumed loop retains the logged effort **only when its initial provider/model route is unchanged**; a route change discards the previous model's opaque id" | 中 |
| pending selection 可能丢 | plan-mode 已知限制："A selection made after a turn's final accepted pre-step remains process-local and is **lost if the process exits** before another accepted in-turn pre-step" | 中 |
| subagent 无模型选择 | "Addressed subagent sessions expose neither entry… subagent continuation deliberately exposes no independent model-selection contract" | 低 |
| Client 半边需审批 | 动态 Cordis Plugin 的 Client 半边要走 `cordis/request-run` 审批流 | 低 |

**结论：**
- **B-2（行为模式）无需 patch core** —— 抄 plan-mode。
- **B-1（新思考档位）不需要 patch core，但需要写一个 `LlmAdapter`**，这比写普通插件重得多。真想在 DeepSeek 官方 adapter 里加第四档，那才是改核心（改 `packages/llm/llm-deepseek`）。

---

## 5. 速查：服务名 / 事件名 / 配置路径

### 服务（`ctx.*`）
```
ctx.systemPrompt      SystemPrompt          packages/core/system-prompt
ctx.sessions          SessionStore          packages/core/session
ctx.agents            AgentRegistry         packages/core/agent
ctx.agentLoop         AgentLoop             packages/core/agent-loop
ctx.compaction        CompactionEngine      packages/compaction/compaction  (impl: compaction-basic)
ctx.toolResultPruner  ToolResultPruner      packages/compaction/compaction-tool-result-pruner
ctx.tokenMeter        TokenMeter            packages/llm/token-meter
ctx.llm               LlmRuntime            packages/llm/llm  (impl: llm-deepseek / llm-pi-ai / llm-replay)
ctx.planMode          PlanModeController    packages/plan/plan-mode
ctx.commands          CommandRuntime        packages/interaction/commands
ctx.skills            SkillRegistry         packages/skill/skill
ctx.agentPresets      AgentPresets          packages/preset/agent-presets
ctx.permissionPresets PermissionPresets     packages/interaction/permission-presets
ctx.agentDefaultModel AgentDefaultModelConfig packages/core/agent-default-model
ctx.settings          Settings              packages/settings/settings
ctx.tools             ToolRuntime           packages/core/tools
ctx.modelDirectories  ModelDirectoryResolver packages/client/ui-model-selection  (Client)
```

### 事件
```
waterfall:  agent/pre-step · agent/request · agent/request-error · llm/stream
            system-prompt/assemble · tools/pre-execute|execute|post-execute
serial:     agent/turn-stopping
emit:       agent/created · agent/disposed · agent/status · agent/session-start
            agent/inbox/{inserted,claimed,discarded,spliced}
            session/created · session/event · session/disposed
            system-prompt/change · commands/change · skills/change
            llm/adapters-updated · agent-preset/selected
            cordis/{dynamic-package,dynamic-retract,request-run,...}
parallel:   session/flush
```

### Session 事件（可 declaration-merge 扩展）
```
核心:  turn/start · turn/end · step/start · step/end · user/message
       assistant/chunk · assistant/message · tool/call · tool/result
       todo/write · request/header · request/context · session/end-seed
插件加的: compaction/start · compaction/summary · compaction/end · compaction/prune
         plan/mode · permission/preset · hook/invoked · hook/result
         command/run · command/done · llm/retry
```
Surface 类型只有三个：`user/message`、`assistant/message`、`tool/result`。插件加的一律 log-only。

### 关键 API 签名
```ts
// Idea A
ctx.systemPrompt.section(section: PromptSection): () => void
ctx.systemPrompt.context(context: PromptContext): () => void
ctx.systemPrompt.variable(name, provider): () => void
ctx.systemPrompt.suppressRuntimeContext(): () => void
ctx.systemPrompt.assemble(context?: AssembleContext): Promise<PromptAssembly>
agent.inject(message: UserMessage): void
agent.steer(message: UserMessage): void

// Idea B
ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle
ctx.llm.resolveModelInfo(provider, model, signal?): Promise<LlmResolvedModelInfo>
ctx.llm.prepareCall(config: LlmCallConfig, signal?): Promise<PreparedLlmCall>
ctx.planMode.get(agent): { active: boolean; pending?: boolean }
ctx.planMode.set(agent, active): 'committed'|'queued'|'cancelled'|'noop'
ctx.commands.register(definition: CommandDefinition): () => void
ctx.agentDefaultModel.currentSelection(): ModelSelection
```

### 配置路径
```
组合:      <profile>/cordis.patch.yml → <home>/cordis.patch.yml → --patch overlay
查看实况:  dsh --profile web --dump-config
生成目录:  docs/config-catalog.md   (全部 config 字段)
           docs/tool-catalog.md      (全部工具 schema)
           docs/persistence-catalog.md (全部 session 事件)
           docs/event-producer-consumer.md (事件生产/消费方)

system-prompt 配置:  includeHarnessIdentity(true) · includeRuntimeContext(true) · persona('') · toolOrder
agent-instructions:  dshHome · projectRootMarkers(['.git']) · maxBytes(必填)
                     maxSourceBytes(1MiB) · instructionFileCandidates(['AGENTS.md','CLAUDE.md'])
                     localInstructionFileCandidates(['AGENTS.local.md','CLAUDE.local.md'])
plan-mode:           section (必填非空字符串)
agent-loop:          maxParallelToolCalls(10) · agents[]

技能发现根（优先级）: 100 <project>/.dsh/skills · 200 <project>/.agents/skills
                      300 customSkillDirs · 400 <dshHome>/skills
                      500 <agentsHome>/skills · 600 bundledSkillDir
```

### 相关设计记录（`.agents/notes/`）
```
architecture/2026-07-24-adapter-owned-reasoning-effort-capabilities.md   ← Idea B 必读
feature/2026-07-24-web-session-model-selector.md                          ← Idea B UI
feature/2026-08-08-pi-ai-per-model-reasoning-declarations.md
simplification/2026-07-22-plan-specific-collaboration-state.md            ← Idea B 模板依据
feature/2026-06-24-workspace-context.md                                   ← Idea A 参考实现依据
feature/2026-06-18-compaction-capability-seam.md                          ← Idea A 对手
architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md
architecture/2026-07-05-reconstructable-requests.md
```

---

## 6. 附：凭据子系统（多 API key 想法的底稿）

来自 `docs/subsystems/credentials.md` 与 `docs/user/guide/providers.md`（已核实，原文）：

> The credential seam of dsh-credentials keeps secrets out of configuration: settings sections and `cordis.yml` entries carry *references* (environment-variable names), providers such as dsh-credentials-local own the values, and consumers resolve a reference once per operation — **the LLM adapters resolve once per model request, so a rotated credential reaches the very next request without any restart**. One seam-wide rule binds every provider: an empty stored value is absent everywhere.

`ctx.credentials` 是**抽象缝**，四个方法：

```ts
abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>
abstract describe(ref: CredentialRef): Promise<CredentialInfo>
abstract set(ref: CredentialRef, value: string): Promise<void>
abstract unset(ref: CredentialRef): Promise<void>
```

`CredentialRef` 是一个 POSIX 环境变量名（branded string）。settings 里存的是 `apiKeyEnv: GATEWAY_API_KEY` 这样的**引用**，值存在 `$DSH_HOME/.credentials.yaml`。本地 provider 的来源层有 `env`、`file`、`project-env`、`user-env`；被实时进程环境遮蔽的引用报 `writable: false`。

`credentials/updated (ref)` 事件在 set/unset/外部编辑后触发，"exists for configuration surfaces refreshing a 'configured' badge"，消费者不需要它（因为每次操作都重新 resolve）。

**【推断】对多 key 的含义：** 因为 `resolve()` 是**每次请求调用一次**、且官方明说这就是热更新机制，一个自定义 `CredentialProvider` 完全可以在每次 resolve 时返回轮换池里的下一个 key，从而实现多 key 轮询/故障转移，且不需要改 adapter、不需要改核心。需要解决的问题是 `ctx.credentials` 作为服务键只能有一个 provider——插件要么替换 `dsh-credentials-local` 那一行，要么注册一个内部委派给它的包装 provider。这条未经实测。

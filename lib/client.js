window.__ModuleLoader__.load({
	id: "dsh-operating-context",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_schema_form = require("@deepseek-ai/dsh-client-schema-form");
		//#region src/client/capacity.ts
		/**
		* Capacity spelling shared with the official Models page: 256K is 256000
		* (thousand-based), never 262144.
		*/
		/** Accepted capacity spellings: a decimal count with an optional K/M suffix. */
		const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i;
		/** Decimal suffix scales — `1M` is 1000K, matching how model capacities are quoted. */
		const CAPACITY_SCALE = {
			k: 1e3,
			m: 1e6
		};
		/** Chip presets shown on the settings page. */
		const WINDOW_PRESETS = [
			{
				label: "200K",
				tokens: 2e5
			},
			{
				label: "256K",
				tokens: 256e3
			},
			{
				label: "400K",
				tokens: 4e5
			},
			{
				label: "1M",
				tokens: 1e6
			}
		];
		/**
		* Read a typed capacity, so a user can write `256K` or `1M` instead of counting
		* zeroes. The stored value stays a plain token count.
		* @param text - raw field text.
		* @returns the count; `undefined` when blank, `NaN` when unreadable.
		*/
		function parseCapacity(text) {
			const trimmed = text.trim();
			if (trimmed.length === 0) return void 0;
			const match = CAPACITY_PATTERN.exec(trimmed);
			if (match === null) return NaN;
			const suffix = match[2]?.toLowerCase();
			const scale = suffix === "k" || suffix === "m" ? CAPACITY_SCALE[suffix] : 1;
			const scaled = Number(match[1] ?? "0") * scale;
			const rounded = Math.round(scaled);
			if (Math.abs(scaled - rounded) >= 1e-6) return scaled;
			return Number.isSafeInteger(rounded) ? rounded : NaN;
		}
		/**
		* Spell a stored count back in the shortest form that survives a round trip
		* through {@link parseCapacity}; a count that is not a whole number of
		* thousands stays written out.
		* @param value - stored capacity.
		* @returns the field text.
		*/
		function formatCapacity(value) {
			if (!Number.isSafeInteger(value) || value <= 0) return String(value);
			if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`;
			if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`;
			return String(value);
		}
		/**
		* A failure carrying a machine-readable code, so whoever has the dictionary can
		* phrase it. Used for the host's own codes and for the few this plugin raises.
		*/
		var CodedError = class extends Error {
			/** Error code, e.g. `settings-conflict`. */
			code;
			/**
			* @param message - a message for a reader who has no dictionary.
			* @param code - the error code when there is one.
			*/
			constructor(message, code) {
				super(message);
				this.name = "CodedError";
				this.code = code;
			}
		};
		/**
		* Take the value out of an RPC envelope.
		* @param response - the envelope.
		* @returns the value.
		* @throws CodedError when the host answered with a failure.
		*/
		function unwrap(response) {
			if (response.result.ok) return response.result.value;
			throw new CodedError(response.result.error.message, response.result.error.code);
		}
		//#endregion
		//#region src/client/ceiling.ts
		/**
		* A model's ceiling is the largest context window it can actually hold. It has
		* to come from somewhere this plugin never writes to, otherwise applying a
		* window would raise the ceiling it is supposed to be clamped by, and every
		* later apply would drift further from the truth.
		*
		* The one source that qualifies is the multi-provider adapter's installed
		* catalog, read back through `llm.discoverModels`. For a catalog route that
		* call answers from local data with no network and no credential, so it is safe
		* on page load. For every other route the answer is that the ceiling is unknown
		* — which is different from "unlimited", and is reported as such.
		*/
		/** Stable identity of a route across a reload. */
		function routeKey(route) {
			return `${route.settingsNs}:${route.provider}`;
		}
		/**
		* Whether a route's native capacities can be read without a network request.
		*
		* Only a route the multi-provider adapter ships a catalog for qualifies:
		* `declared === true` means the adapter knows the route from configuration
		* alone and interrogation would fall through to the endpoint's own listing.
		* An absent `declared` means the adapter draws no such distinction, so it is
		* not evidence of a catalog either.
		* @param route - the route as `llm.providers` reported it.
		* @returns true when `llm.discoverModels` will answer from local data.
		*/
		function hasDiscoverableCeilings(route) {
			return route.settingsNs === "llm-pi-ai" && route.declared === false;
		}
		/**
		* Reduce a discovery answer to the ceilings it disclosed.
		* @param models - what `llm.discoverModels` returned.
		* @returns model id to native context window, skipping models that disclosed none.
		*/
		function ceilingsOf(models) {
			const ceilings = /* @__PURE__ */ new Map();
			for (const model of models) {
				const { contextWindow } = model;
				if (contextWindow === void 0) continue;
				if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) continue;
				ceilings.set(model.id, contextWindow);
			}
			return ceilings;
		}
		/**
		* Apply the clamp: a chosen window never exceeds what the model can hold.
		* @param target - the window the user picked.
		* @param ceiling - the model's native maximum, or `undefined` when unknown.
		* @returns the window that will actually be in force.
		*/
		function effectiveWindow(target, ceiling) {
			return ceiling === void 0 ? target : Math.min(target, ceiling);
		}
		/**
		* Describe what a chosen window does to one route, so the page can state the
		* outcome instead of restating the input.
		*
		* A model that disclosed no capacity counts as applied: nothing caps it, so the
		* chosen window is what it will run with.
		* @param target - the window the user picked.
		* @param models - the route's models as the adapter described them.
		* @param known - whether the description is an authoritative capacity list.
		* @returns the per-route outcome.
		*/
		function outcomeOf(target, models, known) {
			if (!known) return {
				downgraded: [],
				applied: 0,
				unknownCeilings: true
			};
			const ceilings = ceilingsOf(models);
			const downgraded = [];
			let applied = 0;
			for (const model of models) {
				const ceiling = ceilings.get(model.id);
				if (ceiling !== void 0 && ceiling < target) downgraded.push({
					id: model.id,
					ceiling
				});
				else applied += 1;
			}
			downgraded.sort((left, right) => right.ceiling - left.ceiling || left.id.localeCompare(right.id));
			return {
				downgraded,
				applied,
				unknownCeilings: false
			};
		}
		//#endregion
		//#region src/client/failure.ts
		/**
		* Failures, and the words for them. The store raises and records them without a
		* dictionary; this is where a code becomes a sentence, kept out of the component
		* so the choice of words is testable on its own.
		*/
		/**
		* Codes this plugin raises itself. They travel beside the host's own codes so
		* there is one place to look when choosing words.
		*/
		const WRITE_BLOCKED = {
			readOnly: "operating-context/read-only",
			noRoutes: "operating-context/no-routes",
			invalidWindow: "operating-context/invalid-window"
		};
		/**
		* Record any thrown value as a failure.
		* @param reason - whatever was caught.
		* @returns the failure, with a code when the thrower supplied one.
		*/
		function failureOf(reason) {
			if (reason instanceof CodedError) return {
				code: reason.code,
				message: reason.message
			};
			return {
				code: void 0,
				message: reason instanceof Error ? reason.message : String(reason)
			};
		}
		/**
		* Phrase a failed write. The codes worth naming are the ones a reader can act
		* on; anything else keeps the host's own words rather than guessing at them.
		* @param failure - the recorded failure.
		* @param t - the section's dictionary.
		* @returns the sentence to show.
		*/
		function writeFailureText(failure, t) {
			if (failure.code === "settings-conflict") return t("conflict");
			if (failure.code === WRITE_BLOCKED.readOnly) return t("readOnly");
			if (failure.code === WRITE_BLOCKED.noRoutes) return t("noRoutes");
			if (failure.code === WRITE_BLOCKED.invalidWindow) return t("customInvalid");
			return `${t("writeFailed")} ${failure.message}`;
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy for the operating-window section.
		*
		* The page names what the user gets, not how it is stored: no setting keys, no
		* file paths, no adapter vocabulary. `{name}` slots are filled by the section.
		*/
		/**
		* Fill the `{name}` slots of a dictionary string.
		* @param template - the translated string.
		* @param params - slot values, already formatted for display.
		* @returns the filled string; an unknown slot is left visible rather than blanked.
		*/
		function fill(template, params) {
			return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
		}
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			nav: "工作窗口",
			title: "工作窗口",
			intro: "限制每次对话可以携带多少上下文。窗口越小，响应越快、花费越低；在装满之前，较早的对话内容会被自动整理。",
			windowLabel: "窗口大小",
			windowHint: "选一个上限，应用到全部已配置的模型服务。",
			custom: "自定义",
			customPlaceholder: "例如 128K",
			customInvalid: "请填写一个正整数，例如 128K、256K 或 131072。",
			current: "当前 {window}",
			mixed: "各模型当前的窗口并不一致。选一个大小并应用即可统一。",
			noRoutes: "还没有配置模型服务。请先在「模型」页添加一个。",
			readOnly: "当前部署不允许修改设置。",
			apply: "应用到全部服务",
			applying: "正在应用…",
			saved: "已应用 {window}。新的对话会立即使用这个窗口。",
			partiallySaved: "已完成 {applied}/{total} 个写入批次，其余未完成。页面已经重新读取实际状态。",
			loadFailed: "无法读取模型服务。",
			writeFailed: "应用失败。",
			conflict: "本页打开期间设置被其他地方改动了。请重新打开本页后再试。",
			retry: "重试",
			routesLabel: "将应用到",
			routeApplied: "{count} 个模型使用 {window}",
			routeUnknown: "读不到该服务的模型上限，将直接按所选大小写入",
			downgradeNotice: "有 {count} 个模型支持的上限低于 {window}，它们会保持在各自的上限。",
			cleanupNotice: "应用时会移除 {count} 个目录中已经不存在的旧模型覆盖项，以恢复对应服务。",
			downgradeTitle: "{count} 个模型上限更低",
			downgradeHint: "这些模型最多只能到各自的上限，更大的窗口对它们不起作用。",
			modelCeiling: "最高 {window}"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			nav: "Operating context",
			title: "Operating context",
			intro: "Limit how much context each conversation can carry. A smaller window responds faster and costs less; older parts of the conversation are tidied away automatically before it fills up.",
			windowLabel: "Window size",
			windowHint: "Pick a limit and apply it to every configured model service.",
			custom: "Custom",
			customPlaceholder: "e.g. 128K",
			customInvalid: "Enter a positive count, like 128K, 256K, or 131072.",
			current: "Currently {window}",
			mixed: "Models do not agree on a window right now. Pick a size and apply to align them.",
			noRoutes: "No model services configured yet. Add one on the Models page first.",
			readOnly: "This deployment does not allow changing settings.",
			apply: "Apply to all services",
			applying: "Applying…",
			saved: "Applied {window}. New conversations use it right away.",
			partiallySaved: "Applied {applied} of {total} write batches; the rest did not finish. The page has reloaded the actual state.",
			loadFailed: "Could not read model services.",
			writeFailed: "Could not apply.",
			conflict: "These settings changed elsewhere while this page was open. Reopen the page and try again.",
			retry: "Retry",
			routesLabel: "Applies to",
			routeApplied: "{count} models at {window}",
			routeUnknown: "This service does not report model limits, so the chosen size is written as-is",
			downgradeNotice: "{count} models support less than {window} and will stay at their own limit.",
			cleanupNotice: "Applying will remove {count} stale model override entries that no longer exist in the catalog, so their services can recover.",
			downgradeTitle: "{count} models have a lower limit",
			downgradeHint: "These models cannot go past their own limit, so a larger window has no effect on them.",
			modelCeiling: "up to {window}"
		};
		//#endregion
		//#region src/client/plan.ts
		/**
		* How this plugin reads and writes one provider profile.
		*
		* The multi-provider adapter resolves a model's capacity as
		* `entry.contextWindow ?? catalog.contextWindow ?? defaultContextWindow`, where
		* `entry` is either a `models[]` row or a `modelOverrides` patch. That order is
		* why writing `defaultContextWindow` alone changes nothing for a route whose
		* models come from the installed catalog, and why the write target has to be
		* chosen from the profile's shape rather than assumed:
		*
		* - a non-empty `models[]` replaces the served catalog, so capacities belong on
		*   its rows and `modelOverrides` beside it is rejected;
		* - an absent or empty `models[]` on a catalog route serves the catalog, so
		*   `modelOverrides` is the only entry-level lever;
		* - a hand-declared route has no catalog to override, so only its own rows or
		*   the route default can say anything.
		*
		* Within that, one rule decides the value: a model is never given a window
		* larger than it can hold, and a model that already holds the right number is
		* left alone rather than restated. Leaving it alone is what makes the write
		* idempotent and what makes choosing a large window undo earlier clamps.
		*/
		function asProfile(profile) {
			return typeof profile === "object" && profile !== null ? profile : {};
		}
		function modelRows(profile) {
			const { models } = asProfile(profile);
			if (!Array.isArray(models) || models.length === 0) return void 0;
			return models.map((row) => typeof row === "object" && row !== null ? row : {});
		}
		function overrides(profile) {
			const { modelOverrides } = asProfile(profile);
			if (typeof modelOverrides !== "object" || modelOverrides === null) return void 0;
			return modelOverrides;
		}
		function overrideEntry(profile, id) {
			const entry = overrides(profile)?.[id];
			return typeof entry === "object" && entry !== null ? entry : void 0;
		}
		function ceilingMap(entry) {
			return entry.ceilingsKnown ? ceilingsOf(entry.discovered) : /* @__PURE__ */ new Map();
		}
		/**
		* Overrides that name models the authoritative catalog no longer contains.
		* Applying must remove these entries because the adapter rejects the route,
		* but the UI also uses this list to disclose that cleanup before writing.
		*/
		function obsoleteOverrideIds(entry) {
			if (!entry.ceilingsKnown || modelRows(entry.profile) !== void 0) return [];
			const described = new Set(entry.discovered.map((model) => model.id));
			return Object.keys(overrides(entry.profile) ?? {}).filter((id) => !described.has(id)).sort((left, right) => left.localeCompare(right));
		}
		/**
		* The windows a route's models hold right now, after the same precedence the
		* adapter applies. Reading the resolved value rather than the raw setting is
		* what keeps the page from reporting a number that is written but inert.
		* @param entry - the route joined with its profile.
		* @returns one window per model, or the route default when there are no models.
		*/
		function effectiveWindows(entry) {
			const { defaultContextWindow } = asProfile(entry.profile);
			const fallback = typeof defaultContextWindow === "number" ? defaultContextWindow : void 0;
			const rows = modelRows(entry.profile);
			if (rows !== void 0) return rows.flatMap((row) => {
				const declared = row["contextWindow"];
				if (typeof declared === "number") return [declared];
				return fallback === void 0 ? [] : [fallback];
			});
			const ceilings = ceilingMap(entry);
			if (entry.discovered.length > 0) return entry.discovered.flatMap((model) => {
				const patched = overrideEntry(entry.profile, model.id)?.["contextWindow"];
				if (typeof patched === "number") return [patched];
				const ceiling = ceilings.get(model.id);
				if (ceiling !== void 0) return [ceiling];
				return fallback === void 0 ? [] : [fallback];
			});
			return fallback === void 0 ? [] : [fallback];
		}
		/**
		* The settings mutations that put a route under a chosen window.
		* @param entry - the route joined with its profile and disclosed capacities.
		* @param target - the window the user picked.
		* @returns path operations for this route, addressed from its namespace root.
		*/
		function planRoute(entry, target) {
			const at = (...tail) => [...entry.route.settingsPath, ...tail];
			const ops = [{
				op: "set",
				path: at("defaultContextWindow"),
				value: target
			}];
			const ceilings = ceilingMap(entry);
			const rows = modelRows(entry.profile);
			if (rows !== void 0) {
				ops.push({
					op: "set",
					path: at("models"),
					value: rows.map((row) => {
						const id = typeof row["id"] === "string" ? row["id"] : void 0;
						const ceiling = id === void 0 ? void 0 : ceilings.get(id);
						return {
							...row,
							contextWindow: effectiveWindow(target, ceiling)
						};
					})
				});
				return ops;
			}
			for (const [id, ceiling] of ceilings) {
				const existing = overrideEntry(entry.profile, id);
				if (ceiling > target) {
					ops.push({
						op: "set",
						path: at("modelOverrides", id, "contextWindow"),
						value: target
					});
					continue;
				}
				if (existing?.["contextWindow"] === void 0) continue;
				ops.push(Object.keys(existing).length === 1 ? {
					op: "unset",
					path: at("modelOverrides", id)
				} : {
					op: "unset",
					path: at("modelOverrides", id, "contextWindow")
				});
			}
			for (const id of obsoleteOverrideIds(entry)) ops.push({
				op: "unset",
				path: at("modelOverrides", id)
			});
			return ops;
		}
		//#endregion
		//#region \0dsh-css:D:\projects\Dev-Tools\dsh-operating-context\src\client\Section.module.css.mjs
		const css = "._5NeXjq_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}._5NeXjq_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}._5NeXjq_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}._5NeXjq_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}._5NeXjq_card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}._5NeXjq_head{justify-content:space-between;align-items:baseline;gap:8px;display:flex}._5NeXjq_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}._5NeXjq_current{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}._5NeXjq_chips{flex-wrap:wrap;align-items:center;gap:8px;display:flex}._5NeXjq_custom{align-items:center;gap:8px;max-width:200px;display:flex}._5NeXjq_actions{justify-content:flex-end;gap:8px;display:flex}._5NeXjq_saved{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px;line-height:18px}._5NeXjq_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}._5NeXjq_notice{color:var(--dsw-alias-state-warn-label);margin:0;font-size:12px;line-height:18px}._5NeXjq_routes{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}._5NeXjq_route{flex-direction:column;gap:4px;padding:8px 0;display:flex}._5NeXjq_route:first-child{padding-top:0}._5NeXjq_route:last-child{padding-bottom:0}._5NeXjq_route+._5NeXjq_route{border-top:1px solid var(--dsw-alias-border-l2)}._5NeXjq_routeHead{justify-content:space-between;align-items:baseline;gap:8px;display:flex}._5NeXjq_routeName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}._5NeXjq_routeSummary{color:var(--dsw-alias-label-tertiary);text-align:right;font-size:12px;line-height:18px}._5NeXjq_disclosureTitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}._5NeXjq_models{flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;display:flex}._5NeXjq_model{justify-content:space-between;align-items:baseline;gap:8px;display:flex}._5NeXjq_modelId{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}._5NeXjq_modelCeiling{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}";
		const tagId = "dsh-operating-context/Section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-operating-context";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var Section_module_css_default = {
			"routeHead": "_5NeXjq_routeHead",
			"title": "_5NeXjq_title",
			"model": "_5NeXjq_model",
			"modelId": "_5NeXjq_modelId",
			"modelCeiling": "_5NeXjq_modelCeiling",
			"intro": "_5NeXjq_intro",
			"error": "_5NeXjq_error",
			"routes": "_5NeXjq_routes",
			"current": "_5NeXjq_current",
			"hint": "_5NeXjq_hint",
			"disclosureTitle": "_5NeXjq_disclosureTitle",
			"chips": "_5NeXjq_chips",
			"head": "_5NeXjq_head",
			"custom": "_5NeXjq_custom",
			"actions": "_5NeXjq_actions",
			"saved": "_5NeXjq_saved",
			"label": "_5NeXjq_label",
			"routeName": "_5NeXjq_routeName",
			"models": "_5NeXjq_models",
			"notice": "_5NeXjq_notice",
			"routeSummary": "_5NeXjq_routeSummary",
			"section": "_5NeXjq_section",
			"card": "_5NeXjq_card",
			"route": "_5NeXjq_route"
		};
		//#endregion
		//#region src/client/RouteRow.tsx
		/**
		* One configured service and what the chosen window does to it. The row states
		* an outcome rather than echoing the input, because the interesting case is the
		* one where the chosen window does not survive contact with a model's limit.
		*/
		/**
		* Render one service row.
		* @param props - the service, its outcome, and the dictionary.
		* @returns the row.
		*/
		function RouteRow(props) {
			const { displayName, outcome, target, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const downgraded = outcome?.downgraded.length ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: Section_module_css_default.route,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Section_module_css_default.routeHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Section_module_css_default.routeName,
						children: displayName
					}), outcome === void 0 || target === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Section_module_css_default.routeSummary,
						children: outcome.unknownCeilings ? t("routeUnknown") : fill(t("routeApplied"), {
							count: String(outcome.applied),
							window: formatCapacity(target)
						})
					})]
				}), outcome === void 0 || downgraded === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {}),
					title: fill(t("downgradeTitle"), { count: String(downgraded) }),
					open,
					expandable: true,
					expandOnRowClick: true,
					onToggle: () => {
						setOpen((current) => !current);
					},
					titleClassName: Section_module_css_default.disclosureTitle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Section_module_css_default.hint,
						children: t("downgradeHint")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: Section_module_css_default.models,
						children: outcome.downgraded.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: Section_module_css_default.model,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: Section_module_css_default.modelId,
								children: model.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: Section_module_css_default.modelCeiling,
								children: fill(t("modelCeiling"), { window: formatCapacity(model.ceiling) })
							})]
						}, model.id))
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/Section.tsx
		/**
		* The operating-window settings page: pick one window, see what it means for
		* each configured service, apply it everywhere.
		*
		* Page-wide facts live in the store; the only local state is the unsubmitted
		* choice, which nothing outside this component needs to read.
		*/
		const NO_DRAFT = {
			preset: void 0,
			custom: false,
			customText: ""
		};
		/**
		* Render the operating-window section.
		* @param props - inject face from the client apply closure.
		* @returns the section, or nothing until the outlet supplies its dependencies.
		*/
		function OperatingContextSection(props) {
			const { controller, useSnapshot, t } = props;
			if (controller === void 0 || useSnapshot === void 0 || t === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Loaded, {
				controller,
				useSnapshot,
				t
			});
		}
		function Loaded({ controller, useSnapshot, t }) {
			const state = useSnapshot((snapshot) => snapshot);
			const [draft, setDraft] = (0, react.useState)(NO_DRAFT);
			(0, react.useEffect)(() => {
				if (state.status === "idle") controller.load();
			}, [controller, state.status]);
			const changeDraft = (next) => {
				controller.clearWriteFeedback();
				setDraft(next);
			};
			const typed = draft.custom ? parseCapacity(draft.customText) : void 0;
			const current = state.current !== void 0 && Number.isSafeInteger(state.current) && state.current > 0 ? state.current : void 0;
			const target = draft.custom ? typed !== void 0 && Number.isSafeInteger(typed) && typed > 0 ? typed : void 0 : draft.preset ?? current;
			const invalidCustom = draft.custom && draft.customText.trim().length > 0 && target === void 0;
			const rows = state.routes.map((entry) => ({
				key: entry.key,
				displayName: entry.route.displayName,
				outcome: target === void 0 ? void 0 : outcomeOf(target, entry.discovered, entry.ceilingsKnown)
			}));
			const downgraded = rows.reduce((total, row) => total + (row.outcome?.downgraded.length ?? 0), 0);
			const obsoleteOverrides = state.routes.reduce((total, entry) => total + obsoleteOverrideIds(entry).length, 0);
			if (state.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Section_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: Section_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Section_module_css_default.error,
						children: `${t("loadFailed")} ${state.error?.message ?? ""}`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Section_module_css_default.actions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							onClick: () => {
								controller.load();
							},
							children: t("retry")
						})
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Section_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: Section_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Section_module_css_default.intro,
						children: t("intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Section_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Section_module_css_default.head,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: Section_module_css_default.label,
									children: t("windowLabel")
								}), state.current === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: Section_module_css_default.current,
									children: fill(t("current"), { window: formatCapacity(state.current) })
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.hint,
								children: t("windowHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Section_module_css_default.chips,
								children: [WINDOW_PRESETS.map((preset) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									active: !draft.custom && target === preset.tokens,
									onClick: () => {
										changeDraft({
											preset: preset.tokens,
											custom: false,
											customText: draft.customText
										});
									},
									children: preset.label
								}, preset.label)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
									active: draft.custom,
									onClick: () => {
										changeDraft({
											...draft,
											custom: true
										});
									},
									children: t("custom")
								})]
							}),
							draft.custom ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Section_module_css_default.custom,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: draft.customText,
									placeholder: t("customPlaceholder"),
									"aria-label": t("custom"),
									"aria-invalid": invalidCustom,
									onChange: (event) => {
										changeDraft({
											...draft,
											customText: event.target.value
										});
									}
								})
							}) : null,
							invalidCustom ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.error,
								children: t("customInvalid")
							}) : null,
							state.mixed && target === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.notice,
								children: t("mixed")
							}) : null,
							downgraded > 0 && target !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.notice,
								children: fill(t("downgradeNotice"), {
									count: String(downgraded),
									window: formatCapacity(target)
								})
							}) : null,
							obsoleteOverrides > 0 && target !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.notice,
								children: fill(t("cleanupNotice"), { count: String(obsoleteOverrides) })
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Section_module_css_default.actions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									disabled: state.applying || !state.writable || target === void 0 || rows.length === 0,
									onClick: () => {
										if (target !== void 0) controller.apply(target);
									},
									children: state.applying ? t("applying") : t("apply")
								})
							}),
							state.status === "ready" && !state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.notice,
								children: t("readOnly")
							}) : null,
							state.savedWindow === null || state.savedWindow !== target ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.saved,
								role: "status",
								"aria-live": "polite",
								children: fill(t("saved"), { window: formatCapacity(state.savedWindow) })
							}),
							state.partialWrite === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.notice,
								role: "status",
								"aria-live": "polite",
								children: fill(t("partiallySaved"), {
									applied: String(state.partialWrite.applied),
									total: String(state.partialWrite.total)
								})
							}),
							state.writeFailure === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: Section_module_css_default.error,
								children: writeFailureText(state.writeFailure, t)
							})
						]
					}),
					state.status !== "ready" ? null : rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: Section_module_css_default.notice,
						children: t("noRoutes")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Section_module_css_default.card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Section_module_css_default.label,
							children: t("routesLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: Section_module_css_default.routes,
							children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteRow, {
								displayName: row.displayName,
								outcome: row.outcome,
								target,
								t
							}, row.key))
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/write.ts
		/**
		* Apply settings batches in order and retain exact progress when one fails.
		* The host exposes namespace-scoped mutations rather than one transaction, so
		* callers must be able to distinguish a total failure from a partial commit.
		*/
		async function writeBatches(batches, write) {
			let applied = 0;
			try {
				for (const batch of batches) {
					await write(batch);
					applied += 1;
				}
				return {
					ok: true,
					applied,
					total: batches.length
				};
			} catch (reason) {
				return {
					ok: false,
					applied,
					total: batches.length,
					reason
				};
			}
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* Page state for the operating-window section, on the official snapshot store
		* so the shell's subscription and flush behavior are the same as every built-in
		* settings page. The store carries facts and raw host errors; turning either
		* into words is the section's job, because only it has the dictionary.
		*/
		const INITIAL = {
			status: "idle",
			error: null,
			writeFailure: null,
			savedWindow: null,
			partialWrite: null,
			applying: false,
			writable: false,
			routes: [],
			current: void 0,
			mixed: false
		};
		/** Reads the configured routes, and writes a chosen window across all of them. */
		var OperatingContextStore = class {
			/** Snapshot source the section subscribes to. */
			store;
			api;
			/** Latest load wins; an older response never overwrites a newer one. */
			generation = 0;
			/**
			* @param api - the official Web API client.
			*/
			constructor(api) {
				this.api = api;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			}
			/**
			* Load routes, their profiles, and whatever native capacities can be read
			* without leaving the machine.
			* @returns nothing; the outcome lands in the snapshot.
			*/
			async load() {
				const generation = this.generation + 1;
				this.generation = generation;
				this.store.update((draft) => {
					draft.status = draft.status === "ready" ? "ready" : "loading";
					draft.error = null;
				});
				try {
					const [providers, settings] = await Promise.all([this.api.llm.providers({}), this.api.settings.describe({})]);
					const directory = unwrap(providers).providers;
					const document = unwrap(settings);
					const namespaces = new Map(document.namespaces.map((view) => [view.ns, view]));
					const configured = [];
					for (const route of directory) {
						if (route.settingsNs.length === 0) continue;
						const namespace = namespaces.get(route.settingsNs);
						if (namespace === void 0) continue;
						const profile = (0, _deepseek_ai_dsh_client_schema_form.getPath)(namespace.value, route.settingsPath);
						if (profile === void 0) continue;
						configured.push({
							route,
							profile
						});
					}
					const routes = await Promise.all(configured.map(async ({ route, profile }) => {
						const discovered = await this.describeCeilings(route);
						return {
							key: routeKey(route),
							route,
							profile,
							discovered: discovered ?? [],
							ceilingsKnown: discovered !== void 0
						};
					}));
					if (this.generation !== generation) return;
					const windows = new Set(routes.flatMap((entry) => effectiveWindows(entry)));
					this.store.update((draft) => {
						draft.status = "ready";
						draft.error = null;
						draft.writable = document.writable;
						draft.routes = routes;
						draft.current = windows.size === 1 ? [...windows][0] : void 0;
						draft.mixed = windows.size > 1;
					});
				} catch (reason) {
					if (this.generation !== generation) return;
					this.store.update((draft) => {
						draft.status = "error";
						draft.error = failureOf(reason);
					});
				}
			}
			/**
			* Reload for a pushed invalidation, but only when there is a loaded page to
			* refresh and no write in flight to race.
			*/
			refreshIfLoaded() {
				const snapshot = this.store.getSnapshot();
				if (snapshot.status === "idle" || snapshot.applying) return;
				this.load();
			}
			/** Dismiss feedback that belongs to an earlier, now-abandoned choice. */
			clearWriteFeedback() {
				const snapshot = this.store.getSnapshot();
				if (snapshot.savedWindow === null && snapshot.writeFailure === null && snapshot.partialWrite === null) return;
				this.store.update((draft) => {
					draft.savedWindow = null;
					draft.writeFailure = null;
					draft.partialWrite = null;
				});
			}
			/**
			* Put every configured route under one window, then reload so the page shows
			* what the adapter resolved rather than what was requested.
			* @param target - the window the user picked.
			* @returns nothing; the outcome lands in the snapshot.
			*/
			async apply(target) {
				this.store.update((draft) => {
					draft.applying = true;
					draft.writeFailure = null;
					draft.savedWindow = null;
					draft.partialWrite = null;
				});
				let attemptedWrite = false;
				try {
					if (!Number.isSafeInteger(target) || target <= 0) throw new CodedError("window must be a positive integer", WRITE_BLOCKED.invalidWindow);
					const document = unwrap(await this.api.settings.describe({}));
					if (!document.writable) throw new CodedError("the settings document is read-only", WRITE_BLOCKED.readOnly);
					const namespaces = new Map(document.namespaces.map((view) => [view.ns, view]));
					const groups = this.groupOps(namespaces, target);
					attemptedWrite = true;
					const result = await writeBatches(groups.map((group) => ({
						ns: group.ns,
						payload: group
					})), async ({ payload: { ns, ops, revision } }) => {
						unwrap(await this.api.settings.mutate({
							ns,
							ops,
							expectedRevision: revision
						}));
					});
					if (!result.ok) {
						await this.load();
						this.store.update((draft) => {
							draft.applying = false;
							draft.writeFailure = failureOf(result.reason);
							draft.partialWrite = result.applied > 0 ? {
								applied: result.applied,
								total: result.total
							} : null;
						});
						return;
					}
					await this.load();
					this.store.update((draft) => {
						draft.applying = false;
						draft.savedWindow = target;
						draft.partialWrite = null;
					});
				} catch (reason) {
					const failure = failureOf(reason);
					if (attemptedWrite) await this.load();
					this.store.update((draft) => {
						draft.applying = false;
						draft.writeFailure = failure;
						draft.partialWrite = null;
					});
				}
			}
			/** Group every route's operations by the namespace one mutate call can carry. */
			groupOps(namespaces, target) {
				const grouped = /* @__PURE__ */ new Map();
				for (const entry of this.store.getSnapshot().routes) {
					const namespace = namespaces.get(entry.route.settingsNs);
					if (namespace === void 0) continue;
					const profile = (0, _deepseek_ai_dsh_client_schema_form.getPath)(namespace.value, entry.route.settingsPath);
					if (profile === void 0) continue;
					let group = grouped.get(namespace.ns);
					if (group === void 0) {
						group = {
							ops: [],
							revision: namespace.revision
						};
						grouped.set(namespace.ns, group);
					}
					group.ops.push(...planRoute({
						...entry,
						profile
					}, target));
				}
				if (grouped.size === 0) throw new CodedError("no configured model routes to write", WRITE_BLOCKED.noRoutes);
				return [...grouped].map(([ns, group]) => ({
					ns,
					...group
				}));
			}
			/**
			* Ask the adapter for a route's native capacities, but only when the answer
			* comes from local data. `undefined` means the ceilings are unknown, which the
			* page reports rather than papering over with a default.
			*/
			async describeCeilings(route) {
				if (!hasDiscoverableCeilings(route)) return void 0;
				if (typeof this.api.llm.discoverModels !== "function") return void 0;
				try {
					const { models } = unwrap(await this.api.llm.discoverModels({
						settingsNs: route.settingsNs,
						provider: route.provider
					}));
					return ceilingsOf(models).size === 0 ? void 0 : models;
				} catch {
					return;
				}
			}
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* Browser half: register the operating-window page on the official Settings
		* shell and keep it in step with the settings document.
		*
		* The context is described structurally rather than imported: the harness
		* packages are resolved from the module table at runtime and are not installed
		* beside this package, so a declaration here is the only place its expectations
		* are written down.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.operatingContext";
		/**
		* Nav position: immediately after Models (10), which is the page a reader comes
		* from, and before Plugins (15).
		*/
		const ORDER = 12;
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/** Function-plugin name for the browser fiber. */
		const name = "operating-context";
		/**
		* Register the settings section once `settings.section` is on the ledger.
		* @param ctx - browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "operating-context: dictionaries");
			const controller = new OperatingContextStore(ctx.get("connection").api);
			const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(controller.store);
			const t = ctx.locale.bind(NS);
			const injected = () => ({
				controller,
				useSnapshot,
				t
			});
			ctx.effect(() => {
				const refresh = () => {
					controller.refreshIfLoaded();
				};
				const disposers = [ctx.remote.$on("settings/document-updated", refresh), ctx.remote.$on("llm/adapters-updated", refresh)];
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "operating-context: pushed invalidations");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "operating-context",
				order: ORDER,
				label: () => t("nav"),
				locale: NS,
				inject: injected
			}, OperatingContextSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
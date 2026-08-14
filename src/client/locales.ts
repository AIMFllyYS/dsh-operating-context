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
export function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`)
}

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '工作窗口',
  title: '工作窗口',
  intro: '限制每次对话可以携带多少上下文。窗口越小，响应越快、花费越低；在装满之前，较早的对话内容会被自动整理。',

  windowLabel: '窗口大小',
  windowHint: '选一个上限，应用到全部已配置的模型服务。',
  custom: '自定义',
  customPlaceholder: '例如 128K',
  customInvalid: '请填写一个正整数，例如 128K、256K 或 131072。',

  current: '当前选择 {window}',
  mixed: '各模型当前的窗口并不一致。选一个大小并应用即可统一。',
  noRoutes: '还没有配置模型服务。请先在「模型」页添加一个。',
  readOnly: '当前部署不允许修改设置。',

  apply: '应用到全部服务',
  applying: '正在应用…',
  saved: '已应用 {window}。新的对话会立即使用这个窗口。',
  partiallySaved: '已完成 {applied}/{total} 个写入批次，其余未完成。页面已经重新读取实际状态。',

  loadFailed: '无法读取模型服务。',
  writeFailed: '应用失败。',
  conflict: '本页打开期间设置被其他地方改动了。请重新打开本页后再试。',
  retry: '重试',

  routesLabel: '将应用到',
  routeApplied: '{count} 个模型使用 {window}',
  routeUnknown: '读不到该服务的模型上限，将直接按所选大小写入',
  downgradeNotice: '有 {count} 个模型支持的上限低于 {window}，它们会保持在各自的上限。',
  cleanupNotice: '应用时会移除 {count} 个目录中已经不存在的旧模型覆盖项，以恢复对应服务。',
  downgradeTitle: '{count} 个模型上限更低',
  downgradeHint: '这些模型最多只能到各自的上限，更大的窗口对它们不起作用。',
  modelCeiling: '最高 {window}',
} satisfies Record<string, string>

/** Operating-context locale key union. */
export type OperatingContextKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Operating context',
  title: 'Operating context',
  intro: 'Limit how much context each conversation can carry. A smaller window responds faster and costs less; older parts of the conversation are tidied away automatically before it fills up.',

  windowLabel: 'Window size',
  windowHint: 'Pick a limit and apply it to every configured model service.',
  custom: 'Custom',
  customPlaceholder: 'e.g. 128K',
  customInvalid: 'Enter a positive count, like 128K, 256K, or 131072.',

  current: 'Selected {window}',
  mixed: 'Models do not agree on a window right now. Pick a size and apply to align them.',
  noRoutes: 'No model services configured yet. Add one on the Models page first.',
  readOnly: 'This deployment does not allow changing settings.',

  apply: 'Apply to all services',
  applying: 'Applying…',
  saved: 'Applied {window}. New conversations use it right away.',
  partiallySaved: 'Applied {applied} of {total} write batches; the rest did not finish. The page has reloaded the actual state.',

  loadFailed: 'Could not read model services.',
  writeFailed: 'Could not apply.',
  conflict: 'These settings changed elsewhere while this page was open. Reopen the page and try again.',
  retry: 'Retry',

  routesLabel: 'Applies to',
  routeApplied: '{count} models at {window}',
  routeUnknown: 'This service does not report model limits, so the chosen size is written as-is',
  downgradeNotice: '{count} models support less than {window} and will stay at their own limit.',
  cleanupNotice: 'Applying will remove {count} stale model override entries that no longer exist in the catalog, so their services can recover.',
  downgradeTitle: '{count} models have a lower limit',
  downgradeHint: 'These models cannot go past their own limit, so a larger window has no effect on them.',
  modelCeiling: 'up to {window}',
} satisfies Record<OperatingContextKey, string>

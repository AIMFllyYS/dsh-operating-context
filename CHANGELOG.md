# Changelog

All notable changes to this project are documented here. The project follows
the version declared in `package.json`; a dated version heading records the
repository state prepared for that release.

## 0.1.0-rc.3 - 2026-08-14

### Fixed

- Restore the saved window selection when the Settings section remounts. The
  page now keeps the common requested `defaultContextWindow` separate from the
  model windows that were legitimately clamped to smaller native ceilings, so
  a 400K choice remains selected while 256K and 128K models still report their
  real limits.
- Restore non-preset saved values through the Custom input without inventing a
  choice when routes have missing or conflicting window markers.

### Compatibility

- Add provider-contract regressions for the shipped OpenCode, Kimi Coding, and
  Anthropic catalog routes. Planning follows Harness `settingsNs`,
  `settingsPath`, and `declared` metadata rather than a provider allow-list.
- Verify that a hand-declared Anthropic-compatible gateway keeps its endpoint,
  protocol, credential reference, model names, output limits, and unknown
  fields while explicit model windows are updated. Remote discovery remains
  disabled for hand-declared routes, whose native ceilings are unknown.
- The suite now contains 39 passing tests.

## 0.1.0-rc.2 - 2026-08-14

### Fixed

- Ship reviewed `lib/index.js`, `lib/client.js`, and `lib/client.js.map`
  artifacts and remove every Git dependency build trigger (`build`, `prepare`,
  `prepack`, `preinstall`, `install`, and `postinstall`). The local development
  command is now `pnpm bundle`; Git consumers no longer need to modify
  `allowBuilds`, and parent workspace lock settings no longer participate in
  compiling this plugin.
- Reload authoritative settings after every namespace-scoped write attempt.
  A partial multi-namespace commit now reports completed batches instead of
  leaving a stale pre-write snapshot or implying rollback.
- Move initial loading out of React render and into an effect, and clear stale
  success/error feedback when the user changes the pending choice.
- Reject context-window values outside JavaScript's safe-integer range.
- Disclose stale catalog override cleanup before applying it, and never perform
  that cleanup when catalog ceilings are unknown.
- Sort generated CSS module exports so repeated builds produce byte-identical
  client artifacts.

### Changed

- Align `dsh.client.inject` with the package dependency edges used by the
  official Models settings plugin.
- Migrate tsdown dependency controls from deprecated `external`/`noExternal`
  fields to `deps.neverBundle`/`deps.alwaysBundle`.
- Add distribution-contract and sequential-write tests. The suite now contains
  34 passing tests, including lifecycle-hook, artifact, source-map, and partial
  write coverage.

### Compatibility baseline

- Source contract reviewed against DeepSeek Harness `0.1.0-rc.5`, commit
  `47f943859bef60e4160492346772ded9b24f765a`, on 2026-08-14.
- The npm registry exposed `@deepseek-ai/dsh@0.1.0-rc.6` as the latest package
  during final verification. The standalone Git/pnpm consumer install passed;
  a complete `dsh web` browser smoke test remains a separate runtime acceptance
  step.

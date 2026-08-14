# Changelog

All notable changes to this project are documented here. The project follows
the version declared in `package.json`; entries under **Unreleased** are present
on the repository branch but are not a published-version claim.

## Unreleased

### Fixed

- Ship reviewed `lib/index.js`, `lib/client.js`, and `lib/client.js.map`
  artifacts and remove the install-time `prepare` build. Git consumers no
  longer need to modify `allowBuilds`, and parent workspace lock settings no
  longer participate in compiling this plugin.
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

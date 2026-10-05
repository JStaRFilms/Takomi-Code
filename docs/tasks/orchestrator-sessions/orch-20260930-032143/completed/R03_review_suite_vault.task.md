# R03: Review suite-root Vault loading

## Agent setup

Read-only reviewer cwd `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read root AGENTS.md, B03 packet/report, current PiLaunchResources.ts/PiProvider.test.ts/PiAdapter.test.ts diff against HEAD and actual resolver callers. B01's conformance diff is unrelated and must not be edited/reviewed as B03. No writes/commits/install/actual extensions/secret stores/auth/native sessions/build/browser/subdelegation. Return focused review inline; parent persists it.

## Scope and criteria

Verify suite-only/inferred Vault path loading once, shared discovery/launch set, existing trust gating, missing configured-resource diagnostics and unaffected global-only mode. Duplicate exclusion must identify real canonical Takomi extension entries, not discard unrelated companions because an arbitrary workspace/home/package ancestor happens to share a canonical name. Conversely inspect supported TS/JS entry shapes and configured/npm/global duplicates before calling exclusion complete. Keep the scope to real requirement violations rather than invented general loader hardening.

Tests should exercise resolver/caller/load arguments, not static membership, and include meaningful unrelated-companion preservation, no actual runtime secrets. Existing private Vault opt-in and settlement paths remain untouched. Check whether the source change broadens canonical resource requirements and whether current configuration guidance stays truthful.

Builder reports four focused files/108 tests, server typecheck and owned lint/format/diff green, preserved B01 hashes; distinguish independent reruns from builder proof. Run narrow checks only if useful. Definition of done is an inline verdict of confirmed blocking correctness/requirement defects or no blocking findings, with exact source locations and proof under 1000 words. No source changes or full canonical/runtime/client parity claim.

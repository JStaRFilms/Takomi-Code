# B03: Load canonical Vault in suite-root sessions

## Agent setup

Working directory `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, branch feat/pi-parity-next. Read root AGENTS.md, `.repos/effect-smol/LLMS.md`, master_plan.md, G02.report.md, PiLaunchResources.ts and its actual callers/tests before changing code. Follow Build workflow and load unslop. Only active writer; a read-only architect independently defines extension state projection. No subdelegation, commits, installs, auth, actual secret stores, live sessions, servers, clients or builds.

Baseline commit is c77ef31fd8. B01's two conformance files remain uncommitted and must be preserved byte-for-byte. Local session files are untracked on purpose; stage nothing. The canonical suite is an authorized read-only reference for this slice, not an edit target.

## Objective

Fix the shared suite-root resource omission of takomi-vault. An explicitly configured or correctly inferred canonical suite must load Vault once from that suite, even when no global Vault installation happens to mask the omission. Discovery and actual session launch must use the same resource set.

## Exact current root cause

PiLaunchResources.ts TAKOMI_EXTENSION_NAMES lists runtime, subagents, oauth-router, context-manager, notify-sound and antigravity-provider but omits takomi-vault. The list drives both explicit load paths and inferred-suite completeness/duplicate filtering. Shared resolver callers include resource discovery, provider health and PiAdapter launch.

Inspect actual duplicate handling across global directory entries, explicit extensions and npm package manifests before claiming coverage. Preserve supported companion packages. Suite resources should not be shadowed by an unrelated global Takomi copy in suite mode. Report any pre-existing duplicate mechanism that cannot be fixed narrowly rather than silently claiming it is covered.

## Allowed scope and requirements

Prefer PiLaunchResources.ts and its existing focused caller tests. If a focused resolver test is the clearest behavioral proof, add it without generic test infrastructure. Update existing inferred-suite fixtures to match the real canonical seven-extension suite, not skip the new resource to keep tests green. A minimal affected product-document sentence is allowed if configuration requirements change. No canonical suite dependency changes or general resource-loader refactor.

Required proof:

- Explicit complete suite includes its Vault extension exactly once, with no global Vault required.
- Inferred canonical suite setup includes Vault and remains recognized; source-checkout trust/allowInferredSuite=false behavior stays unchanged.
- A duplicate global Takomi Vault entry does not replace or double-load suite Vault, while unrelated companions still load.
- If configured suite is incomplete, health/discovery/launch follow the existing missing-path/error contract and name the missing canonical resource. Do not silently fall back to a different workspace/global resource set.
- Existing global-only mode remains unchanged. Preserve private Vault input/transfer opt-in flags and command settlement; no secrets or auth behavior changes.

Start with the smallest failing behavioral regression. Test public resolver/caller outputs and invocation args, not static list membership or component snapshots. Reuse fixture NodeFS temp directories and Effect filesystem layers; write only synthetic disposable suite/agent homes, not actual suite or ~/.pi.

## Verification

Run new/touched focused tests, relevant provider/resource/inferred-suite tests, and existing PiAdapter Vault/private paths. Run server typecheck and owned-file lint/format/diff checks. No repo-wide checks. B01 lint debt remains separate; do not touch/suppress it. Record exact commands/counts/skips and fixture cleanup. An actual Pi model/session/client is not needed or authorized for this loader test.

## Deliverables and completion

Return narrow owned diff plus `B03.report.md` in this session with root cause, load/duplicate/trust/missing-path behavior, red-first and final evidence, preserved B01 hashes and limits. Do not commit. Parent does one focused read-only review, corrects confirmed issues through this conversation, and commits only accepted owned files. Complete only when required behavior and focused checks pass with no confirmed blocking regression; global/canonical compatibility beyond these synthetic tests remains separate proof.

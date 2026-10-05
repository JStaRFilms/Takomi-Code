# R04: Review Pi notice severity and all-client input results

## Setup

Read-only reviewer cwd `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read AGENTS.md, B04 packet/report, owned diff against HEAD aa27b04c40 and actual nearby callers/renderers. B01's conformance diff is unrelated and byte-preserved. Read narrow relevant source sections, not every giant file wholesale. No source/report writes, formatter, staging, commits, subdelegation, native extensions/sessions/secrets/auth, installs/builds/servers/browser/Metro. Return your result inline under 1000 words; parent persists it.

## Objective and scope

Check actual end-to-end behavior across typed event contract, PiAdapter, real persisted ingestion, shared work-log interpretation and web/desktop/mobile renderers. The synchronous writer stopped before reporting; parent recovered its source and red-first log and ran all seven relevant files with 615 passing tests, all five affected package typechecks, owned lint/format/diff. This is not integrated client proof.

## Review questions

- Are new optional severity/inputOutcome fields backward compatible, bounded and correctly exported/decoded? Are command labels accurate for both commands and non-command handled inputs? No arguments/private values/raw record added to typed metadata.
- Does notify map actual native notifyType, including absent/unknown values, without turning uncorrelated error notifications into owned submission failure or runtime.error? Check B02 ownership and old correlation/error races remain unchanged, including native work settling before/after acknowledgements and a newer active turn.
- Does ingestion retain severity and outcome in persisted payload, use existing error tone, and keep unrelated active native session/turn running? No schema migration or new lifecycle transition.
- Do actual renderers preserve explicit info/warning/error, failed labels/accessibility, legacy warning fallback and original turn association? Check downstream grouping/turn summaries so an extension error notice cannot falsely mark a still-running native turn failed. Check notice rows do not accidentally get tool success/failure semantics, restore actions or semantic tool cards. Preserve actual tool errors and dedicated Vault notice/transfer rendering.
- Are focused tests behavioral and sufficient for changed paths, rather than static markup or callback wiring? Read current synthetic private/Vault regression coverage; do not run actual accounts/extensions.
- Lint exited zero but emitted existing warnings in MessagesTimeline.tsx and thread-work-log.tsx. Confirm warned source lines/callers are unchanged against git show HEAD, and identify any new diagnostic rather than claiming all warnings are baseline without proof.

Parent already ran the exact focused tests/typechecks. Rerun only what a concrete concern needs. One focused review, no speculative cleanup or new abstractions. Report confirmed blocking defects with exact locations and evidence, or no blocking findings with your independent checks and real limitations. Keep B01 untouched and do not suppress its separate lint blocker.

## Definition of done and deliverable

Inline review verdict and concrete source/check evidence covering the above. Any real implementation defect goes back to the same B04 conversation for a narrowly scoped correction, or parent direct correction only if execution tooling cannot complete. No full parity or release-readiness claim.

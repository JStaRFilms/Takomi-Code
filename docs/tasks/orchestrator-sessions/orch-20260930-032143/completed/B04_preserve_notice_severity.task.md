# B04: Preserve Pi notice severity and command results across clients

## Agent setup

Work only in `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, branch `feat/pi-parity-next`, baseline aa27b04c40. You are the only implementation writer. Use Build and unslop. Read root and applicable nested AGENTS.md, `.repos/effect-smol/LLMS.md` before Effect changes, and this packet completely.

Prime context under `docs/tasks/orchestrator-sessions/orch-20260930-032143/`: master_plan.md, D01.design.md, A02.plan.md, B02.acceptance.md, B02.revision.md, B03.acceptance.md. Read `docs/features/takomi-pi-provider.md` and actual source/types/tests below before editing. Native Pi reference is `C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent`. Read its rpc-extension-ui.md and relevant linked docs completely and inspect actual notify request type/producer. Do not substitute a remembered native field.

## Objective

A Pi info notification must not display as a warning. A Pi error or failed handled-input result must appear as a failure while retaining the originating turn. Deliver the same interpretation to web, desktop through web, and native mobile, without changing model-run lifecycle or storing private response values.

## Current behavior

RuntimeWarningPayload in contracts has message, optional unknown detail, Vault-only category and transferId. Ingestion's runtime.warning branch always persists tone info and drops any other fields. PiAdapter notify ignores native notifyType. B02 handled/failed responses emit runtime.warning with detail.kind pi.prompt-outcome and original pending.turnId, requestId, outcome and optional commandName. That metadata remains untyped and failed outcomes are currently informational rows.

Web and mobile convert activities independently. Web MessagesTimeline tests sourceActivityKind runtime.warning for its warning indicator. Mobile workEntryIcon unconditionally maps that kind to warning. Vault categories have dedicated notice/transfer behavior which must remain intact.

## Scope and source map

Inspect and minimally extend:

- `packages/contracts/src/providerRuntime.ts` and relevant focused schema tests/exports only as needed.
- `apps/server/src/provider/Layers/PiAdapter.ts` and `.test.ts`.
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` and `.test.ts`; existing projector/storage code only if the actual path requires retaining new optional payload fields.
- `packages/client-runtime/src/work-log/presentation.ts` or the existing closest shared helper/types, with focused tests. Current explicit package exports include work-log/presentation and tool-presentation. Reuse those rather than adding a new module/export unless cohesion truly requires it.
- `apps/web/src/session-logic.ts`, existing tests and `components/chat/MessagesTimeline.tsx` only for interpreting/rendering the new notice/result metadata.
- `apps/mobile/src/lib/threadActivity.ts`, existing tests and `features/threads/thread-work-log.tsx` or the actual feed renderer only where required for the same interpretation.
- Relevant paragraph in `docs/features/takomi-pi-provider.md` if the visible behavior/interface description changes.

Read callers and actual rendering before deciding which client files need a diff. Do not restyle UI primitives, introduce a new design system, add decorative cards/animations, or test component callback wiring/static markup as proof. Desktop inherits web rendering; change Electron only if a real independent path exists.

## Required behavior

1. Add optional typed notice severity info/warning/error to RuntimeWarningPayload. Keep legacy events and other providers working without the field. No new persisted activity tone or database migration.
2. Add optional typed outcome metadata for the existing B02 handled/failed submission result. Include bounded opaque request ID, outcome and optional command name, never prompt text/arguments/private answer/raw native record. Prefer a name that remains accurate for input-handler submissions with no command name. Keep existing detail.kind metadata for compatibility.
3. Pi notify maps the actual native info/warning/error type. Missing or unrecognized type uses a documented safe display default rather than affecting execution. Missing native type defaults to info. Do not reclassify an uncorrelated native error notification as an owned command failure.
4. B02 success uses info and failure uses error. Preserve pending.turnId exactly, its bounded correlation behavior and all existing before/after-acknowledgement/late-run settlement semantics. An error notice must not emit runtime.error or terminate an unrelated active native turn.
5. Ingestion retains typed metadata in persisted activity payload. Error severity maps to the existing error tone; info/warning use existing supported tones. Legacy absent severity follows previous ingestion behavior.
6. Use shared client interpretation for explicit severity and typed outcomes. Legacy runtime.warning records retain their prior warning fallback. Info should not get a warning indicator; explicit warning should; explicit error/failed result should have an error presentation and a clear failed label. A handled command and a handled non-command input get accurate labels. Failed means the submitted input failed, not that unrelated native work failed.
7. Preserve Vault dedicated category/transfer rendering and private input/archive opt-in paths. Do not duplicate private content in generic notices, introduce new raw logs, or change secret response/export data flow. Native notifications cannot be declared universally secret-safe because OAuth producer ownership is a separate open task.
8. Keep generic notices in the work log. Do not fabricate assistant messages, mutate manual thread titles, open URLs, trigger OS notifications, or offer file restore/checkpoint controls on command outcomes.

## Tests and verification

Use red-first tests for current lost notification severity and failed-result presentation. Test meaningful behavior, not literal source membership.

- Adapter covers info/warning/error/missing/unknown notifyType, handled/failed typed outcomes, an uncorrelated error notification during a live model turn, original turn ownership with a newer active turn, and no private value/argument in new metadata. Reuse fixtures and existing B02 race coverage; do not reproduce all unchanged tests.
- Real persisted ingestion tests assert error tone and typed payload retention, original-turn ownership, active session/turn unchanged by an unrelated error notice, and legacy absent metadata. Wait on receipts/drains, never sleeps/polling.
- Shared/web/mobile tests exercise actual activity-to-work-log/feed interpretation and labels for explicit severity, handled/failed, absent command name, legacy fallback and existing Vault categories. No new snapshot/static-render tests merely asserting props.
- Run changed/relevant test files with explicit paths. Run server, contracts, client-runtime, web and mobile package typechecks where changed, not a recursive/repo-wide check. Run owned-file lint, format and git diff --check. Record exact counts/commands and distinguish pre-existing failures.

A real web/desktop/mobile integrated pass remains open. No browser tools, servers, Metro, native/release builds or installs in this task. Source/static tests are not integrated proof.

## Preservation and safety

B01 is an unrelated dirty slice. Do not edit, format, stage or suppress diagnostics in PiProtocolConformance.ts or .test.ts. Their intake SHA-256 values must remain unchanged: test 9a51e2c08f62afb79055d05017592bc38733de80f88e5727280e205e2907b6ca; source b089c712c9fb132ffbc1c5b79e7f1e377fb4fca1cbc7d1bbd4dbd2a54dc4748b.

No canonical-suite/live-checkout/user-global writes, credentials/accounts/OAuth, real native session files, runtime extension execution, commits, merges, pushes, publishing, deployment, PR or subdelegation. Disposable synthetic fixtures only. One implementation pass. If architecture conflicts with the packet, report the concrete conflict before expanding scope.

## Definition of done and artifacts

Owned source/test/doc diff implements the full severity/outcome path for web/desktop/mobile, targeted checks pass or a specific baseline blocker is recorded without hiding it, and B01 hashes match. Write `B04.report.md` at the session root with changed files, design decision, red-first/final proof, commands/counts, preservation and real limitations. Return a concise summary. Parent runs one focused review, routes confirmed corrections through this conversation, then stages only reviewed owned files for the slice commit.

## Dependencies

G01/G02/D01/A02 and reviewed B02/B03 are complete. B01 is separate and remains blocked. Ephemeral status/widget/title/editor state and private OAuth producer ownership are later slices, not part of B04.

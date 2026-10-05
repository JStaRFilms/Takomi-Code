# B07: Offer explicit, revision-safe native editor suggestions

## Setup

Sole synchronous writer in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next, merged baseline058d96cfa6893bb3b0b8a93afcef4c1e05976f8b. Read AGENTS.md and relevant app instructions, unslop, and Effect reference before Effect changes. Prime this session D01.design.md, B05.acceptance.md, B06.acceptance.md/report, M01.report.md, M01.validation.md, RM01.review.md, G03.rescope.md and current providerExtensionState contract/shared atom. Upstream integration is committed, with local Vite Plus1.0.0 and Vitest5.0.1. The accepted two Windows Claude fixture failures remain narrow and are not relevant excuses for new composer failures.

## Objective

Web/desktop and native mobile offer Pi's latest editor suggestion as unsent text with explicit local Replace, Insert and Dismiss. Native RPC supplies no originating device or draft revision, so every device receives a suggestion. No automatic replacement, sending or mutation of another device's draft. Source ownership, user intent and the current local draft must all still match when applying.

## Actual code to inspect first

Web apps/web/src/components/ComposerPromptEditorTiptap.tsx, components/chat/ChatComposer.tsx, and composerDraftStore.ts. Inspect the current readSnapshot/readSelectionRange APIs and preserve upstream suggestions/accessibility/editor synchronization. Mobile apps/mobile/src/features/threads/ThreadComposer.tsx, state/use-composer-drafts.ts, native/composerEditorRevision.ts, controlled TextInput selection and attached image/file/model/options metadata. Extend actual draft-store and native composerEditorRevision tests where these mutations belong. B06's state/providerExtensionState bindings and ProviderExtensionText components show the current scoped snapshot pattern. Runtime snapshots have generation, owning instance, active status and editorSuggestion{id,text}, plus omission flags. Shared state separates current from stale/disconnected/unsupported and fences connection sessions. Read real APIs/types/tests before choosing guard integration. Reuse existing confirmation/sheet/button and draft utilities.

## Required behavior

- Show a compact plaintext suggestion preview near the actual composer when a current active snapshot carries it. Never run it as a command/tool, generate a model prompt or auto-send. Use existing UI variants and responsive/native keyboard patterns. Do not rename titles or change status/widget/worklog behavior.
- Replace changes only local draft text. Insert replaces the captured selection or inserts at the current caret using the actual editor API. If a platform cannot obtain a caret, label an explicit append alternative honestly rather than pretend cursor insertion. Preserve current attachments, files/images, model/runtime/options, mentions and other draft metadata not intentionally affected by text editing. Do not replace the entire draft object with a freshly constructed one.
- Capture environment/thread/current source generation/suggestion ID and the actual draft revision/content/selection when the user requests an action. Before committing, re-read current authoritative local state and source. A different source suggestion/generation, inactive/disconnected state, thread/environment navigation or revoked connection must prevent the old action, not use a newly selected target.
- Existing draft text requires a clear preview and explicit replacement intent. If the draft/revision changes while confirmation is open, don't overwrite it. Offer refreshed confirmation using the current draft and preserve the existing edits. Recheck at final apply; another concurrent change must remain safe. Preserve attachments changed during confirmation too. No stale closure or captured object overwrites a newer draft.
- Dismiss is per device and per environment/thread/source generation/suggestion ID. It does not clear server state or another device. Repeated unchanged snapshots stay dismissed; a new suggestion/process can be offered. Applying may locally consume that exact suggestion but must not suppress unrelated/new suggestions or accumulate every historical suggestion indefinitely.
- Handle empty suggestion as an explicit clear-text proposal, not native deletion of attachments. Honor existing composer input bounds/validation. For oversized suggestions, provide an honest blocked/truncated-preview state with full text available through existing detail/copy affordances; never silently apply clipped text as the full native suggestion. Distinguish preview abbreviation from native truncation flags.
- Safe actions require current native ownership and matching supported instance, not future model/global Settings selection. Disabled/stale preview must not authorize mutation. Existing queued drafts and active run steering/follow-up choice stay intact; no automatic submission or queue change.

## Scope

Shared action/guard logic only where reused across platforms; actual local web/mobile draft/editor integration and feature-local UI; focused tests and concise task-oriented existing docs if usage changes. No new dependency/control RPC/private auth pipeline/server lifecycle redesign or metadata abstraction. B05/B06 remain reviewed baselines. Canonical/global/live resources unchanged. No unrelated cleanup.

## Verification

Meaningful tests exercise actual draft mutations and competing edits, not callback wiring/static props. Cover both platforms: replacement/insertion at selection, nonempty/empty text, draft changing before/after confirmation, attachment/metadata changes, navigation/environment/source replacement/disconnect/end, same ThreadId in different environments, local dismissal/reoffer, oversized input, no send and another device's draft unchanged. Deterministic coordination; no sleeps/polling. Preserve existing composer/draft/event-scope tests.

Focused tests and affected package typechecks, owned lint/fmt/diff only. No repo-wide checks or warning suppressions. Existing diagnostics must be independently attributed if present; B05's accepted two Claude failures are not a general waiver. No stage/commit/subdelegation/install/dev servers/Metro/browser/computer use/native or release builds/real sessions/auth/live/canonical/global changes. Existing hermetic tests allowed. Built-in Browser tools absent; do not substitute automation or claim integrated proof from host doubles.

## Completion

Both real composer entry points use the guarded actions, focused checks pass and no confirmed regression remains. Write exact session-root B07.report.md with owned paths, concrete revision/selection/metadata/source checks, commands/counts and platform limits. Return synchronously. Parent runs one focused review, routes confirmed corrections through this conversation and commits accepted owned files. Integrated web/desktop/iOS/Android, CLI handoff and broader parity stay open.

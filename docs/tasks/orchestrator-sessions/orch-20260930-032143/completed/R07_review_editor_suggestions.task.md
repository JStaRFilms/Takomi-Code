# R07: Review guarded local editor suggestions

## Setup

Read-only reviewer in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, branch feat/pi-parity-next. HEAD is reviewed integration058d96cfa6893bb3b0b8a93afcef4c1e05976f8b. Read AGENTS.md, unslop, B07 packet/report/recovery, D01, B05/B06 acceptance, M01/RM01 and G03. Inspect all19 owned source/test/package/doc paths listed in B07.report.md and .plans/b07-owned.json. Session artifacts are uncommitted; no staging or writes.

## Objective

One focused correctness and regression review of explicit local Replace/Insert/Dismiss in real web/desktop and native mobile composers. Verify the implementation meets the authored B07 requirements using actual APIs and behavior, not report prose or callback wiring. Do not expand scope into styling, speculative flexibility or unrelated fixes.

## Scope and completion criteria

Check final apply reads actual environment/thread/source/active owner/process/suggestion/connection generation and locks. Replacing the source or navigating, including away-and-back, must revoke old intent. A future selected model must not replace native authority.

Check actual draft subscriptions/revisions and editor/native snapshots, selection and text. Confirmation must refresh on every competing edit, including edit-away-and-back, metadata or attachment changes. Final setter must spread latest current metadata, never old captured draft. Empty clears only text, selected insertion honors serialized offsets/mentions, append fallback is honestly labeled, oversize/omission cannot apply clipped text. No await separates last checks and mutation; no send, queue, other-device or server clear.

Review Tiptap focus fix, actual editor test and upstream active-descendant/suggestion behavior. Review iOS/Android snapshot API, accepted native event counts and controlled-document rejection/suppression in actual native source. Identify any confirmed new synchronization regression; physical in-transit native events remain an acknowledged installed-client verification limit, not proof from helper tests.

Dismiss/apply consume exact identity locally, bounded64thread entries, not historicalIDs. Unrelated widget updates shouldn't reoffer, newprocess/newcandidate should. UI follows existing variants and disabled/preview semantics, no automatic draft writes.

Package export is necessary and narrow. Existing docs accurately distinguish implemented state/actions from remaining native/runtime/private/integrated gaps. What can be deleted while remaining correct? Report confirmed unnecessary complexity only if it violates requested scope or introduces an actual defect; no speculative refactor.

## Verification

Recovery reports324tests across11files, including final peer-device test added after the first report, three package types, zero ownedlint errors and64 inherited warnings. Independently verify decisive tests/checks on current bytes. Review actual warning baseline-copy comparison using exact diagnostic rule/label/source spans. Baseline renamed copies have path-dependent Uniwind errors, not a claimed successful baseline check. No warning suppressions or new warnings accepted.

Use focused hermetic tests and affected package types only. No full suite, installation, prepare, stage/commit, source writes, subdelegation, server/Metro/browser/computer use/native/release builds/real session/auth/live/canonical/global operations. React/Tiptap jsdom and native helper tests aren't integrated proof. Source frontend checklist should state actual entry points/clients/provider/wire/reverse/connection/doc coverage and what remains untested.

Return inline approval or confirmed blockers with exact source/repro/minimal correction, actual commands/counts and limits. Parent saves R07.review.md, sends confirmed fixes to samef507writer if needed, then commits owned19paths only. B08 compaction/stats and later slices remain separate.

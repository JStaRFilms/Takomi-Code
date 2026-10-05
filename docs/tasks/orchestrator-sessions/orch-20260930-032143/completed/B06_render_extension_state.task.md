# B06: Render current native statuses/widgets/subtitle on every client

## Setup

Sole synchronous writer in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next, baselinef5183248d3. Read AGENTS.md/app instructions and unslop. Read Effect reference before Effect changes. Prime this session D01.design.md, A03.plan.md, B05.acceptance.md, B05.report.md; current contracts providerExtensionState.ts and shared state/providerExtensionState.ts. No broad orchestration/genesis reinitialization.

## Objective

Use the real B05 authorized snapshot stream/shared atom to show native keyed status, string widgets and runtime subtitle in web/desktop and native mobile. This is user-visible presentation, not TUI pixel cloning, not model-driven tools. B07 editor suggestion actions follow separately. Do not expose a fake action or silently claim full parity.

## Actual source anchors

Shared exported /state/providerExtensionState has createEnvironmentExtensionStateAtoms(runtime,{threadShellAtom,configValueAtom}) and stateAtom(ScopedThreadRef). State is unsupported with supportunknown/unsupported, current snapshot, stale/disconnected with nullable last snapshot. Pi capability extensionState:text-v1. Source is supervisor-tagged environment/thread scoped with idleTTL0. Bind one helper to actual web/mobile environment runtime/atom construction; don't create duplicate streams/global stores per component.

Web uses apps/web/src/state, ChatView.tsx, chat/composer components, ThreadRouteView/ThreadCommandSubtitle and actual header. Desktop wraps web; no Electron/window/document title update. Mobile lib/runtime.ts and shared atom setup, ThreadDetailScreen.tsx, ThreadComposer.tsx, useThreadHeaderOptions.tsx/android.ts and existing native sheets/detail primitives. Existing thread-provider-instance helpers distinguish thread/session owners. Inspect actual narrow source/component blocks before placing output.

## Behavior and presentation

- Follow D01: compact current status near composer/header; widgets near the actual editor respecting aboveEditor/belowEditor. Long output opens existing disclosure/detail/native sheet, not a dashboard, large cards, giant typography or gratuitous limits. Preserve bounded text lines; text only, no HTML/Markdown link parsing or auto-open. No continuously repainting animation.
- Current runtime title is a subtitle separate from manual thread/native session title and global app/window title. Empty subtitle clears visually. Keyed replacement/clear/process end must remove old content, not stack activity/tool cards.
- Support/connection state is honest. Unknown/older/non-Pi never invokes unsupported RPC or presents feature controls as working. Disconnected/stale cached output is clearly last-known, not current; inactive fresh snapshot clears content. Reconnect/replacement don't show an old owner's subtitle as new.
- Authority is the thread's owning environment/active provider instance, not global Settings selection or another environment with sameThreadId. Verify capability gate doesn't incorrectly hide an active Pi context merely because a future model selection differs; fix only a confirmed shared-support selection defect needed for this binding and test it.
- Preserve exact native keys for replacement; don't truncate into collisions. Compact visual ellipsis may expand/access actual full bounded text. Show explicit truncation/overflow note when snapshotflags say content omitted; don't hide that behind collapsed output.
- Local hiding/disclosure is different from native clearing. If local dismiss is offered, scope it by environment/thread/process/key/content identity; unrelated status changes shouldn't re-show dismissed same content, while replaced content/newgeneration must be reachable. Don't send a clear mutating RPC or imply the extension itself was cleared. Keep alternate current detail access available. Prefer minimal existing disclosure patterns.
- No editor suggestion actions or automatic draft writes/sends yet. Don't move widgets into chat history, checkpoints, errors, tool cards or OS notifications. Preserve B04 worklog severity and private Vault handling. Generic text isn't universally secret-safe; no OAuth authorization ownership work here.

## Scope

Existing web/mobile runtime/state binding + actual thread/header/composer integration, feature-local plain-text presentation if necessary, shared display interpretation only when truly reused, and focused behavior tests. No server lifecycle/broker redesign, package dependencies, new private/control endpoints, canonical/global/live changes or unrelated cleanup. Update existing feature/user docs only if task-oriented guidance actually changes; no feature catalog/architectural duplication.

Use established ui exports variants/sizes, not restyling className. Layout on parents. Read specific nested AGENTS. Do not blindly render all100line*16 widgets expanded in a tiny composer; keep usable viewport/native keyboard/responsive behavior and stable keys. Avoid costly rerender/recompute from unrelated worklogs.

## Verification and completion

Meaningful shared/presentation/controller/component behavior tests cover actual bound output, above/below placement, replace/clear/inactive/reconnect/stale/truncated, exact key/content local disclosure/dismiss identity if present, subtitle vs manual/global titles, ownership/multienvironment/support and no draft/lifecycle mutation. No static-render prop/attribute tests or callbacks-only proof. React/RN testing should follow existing harnesses; don't invent browser automation.

Focused tests + affected web/mobile/shared typechecks, owned lint/fmt/diff. No repo-wide checks, standalone dev/server/Metro, browser/native/release builds/install/computer-use or real sessions/accounts. Built-in Browser tools unavailable; do not substitute automation or call tests integrated proof. Existing hermetic tests allowed.

B05's explicitly accepted unchanged Windows-Claude fixture failures are unrelated; don't touch/waive new diagnostics. No commit/stage/subdelegation. Preserve baseline and all local artifacts. Write exact session-root B06.report.md with files, checks/counts, all-client path/behavior and real unverified limits. Return synchronously. Parent reviews once, routes confirmed corrections through same conversation, then commits owned files. B07/full integrated/runtime/remaining parity stays open.

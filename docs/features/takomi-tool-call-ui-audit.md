# Takomi tool-call UI audit and implementation plan

**Status:** Audit complete; visual exploration and implementation not started  
**Branch:** `feat/takomi-tool-call-ui`  
**Primary surface:** Desktop/web  
**Mobile:** Deferred UI work, but the contract and presentation model must remain shareable

## Goal

Make every Takomi/Pi tool call legible and useful in Takomi Code without recreating Pi's terminal UI or introducing a separate visual language. Reuse T3 Code's current work log, plan, question, approval, markdown, file, preview, badge, disclosure, and status primitives wherever possible. Build custom UI only for tool families whose state cannot be expressed clearly by the generic work-log row.

## Scope decision

There are two related inventories:

1. **Core Takomi/Pi tools:** 12 public Takomi extension tools, plus Pi's built-in file/shell/search/image tools and interactive extension requests.
2. **Optional TakomiFlow MCP tools:** 19 public `takomi_flow_*` tools.

This plan covers all 31 custom tools so the architecture does not dead-end, but implementation should prioritize the 12 core Takomi tools and interactive question/approval fidelity. TakomiFlow cards can follow after the same presentation contract is proven.

## Audit summary

### What already works well enough to reuse

| Existing surface              | Current T3 Code primitive                               | Decision                                  |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Pi `select` questions         | `ComposerPendingUserInputPanel`                         | Reuse and refine                          |
| Pi `confirm` prompts          | `ComposerPendingApprovalPanel` and approval actions     | Reuse with corrected confirmation wording |
| Generic tool lifecycle        | Expandable work-log rows in `MessagesTimeline`          | Keep as universal fallback                |
| Plans and long markdown       | `ProposedPlanCard`, `PlanSidebar`, `ChatMarkdown`       | Reuse for workflows and master plans      |
| Files and changes             | `ChangedFilesTree`, file chips, diff panel              | Reuse                                     |
| Images and browser output     | Preview/image components                                | Reuse for artifacts                       |
| Status, warnings, collections | Badge, alert, collapsible, card, table/sheet primitives | Compose into semantic card families       |

Desktop uses the web client, so one web implementation covers desktop and browser surfaces. Mobile is React Native and cannot reuse DOM components, but it can consume the same semantic presentation model later.

### Main technical blocker

Takomi's structured result data is currently lost before most clients can use it:

1. `PiAdapter` emits `{ toolCallId, toolName, args, result }` in `payload.data`.
2. `ActivityPayloadProjection` removes most non-MCP structured fields.
3. Web and mobile only expose `toolData` for items classified as `mcp_tool_call`.
4. Most `takomi_*` tools are classified as `dynamic_tool_call`; `takomi_subagent` becomes `collab_agent_tool_call`.
5. `takomi_flow_*` names do not contain `mcp`, so name-based classification also treats them as generic dynamic calls.

Custom cards must therefore start with a bounded provider-neutral contract. Styling the current flattened text first would create throwaway UI.

## Tool inventory and UI decisions

### Core Takomi tools

| Tools                                                  | Existing fit                          | Decision                                         | Desktop presentation                                                               |
| ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `takomi_mode`                                          | Status row, badge                     | Adapt                                            | Compact mode/stage badge with expandable reason and source                         |
| `takomi_apply_routing_policy`, `takomi_config_routing` | Work row, markdown/code, status       | Shared configuration card                        | Scope, preview/write state, detected defaults, errors, expandable policy/diff      |
| `takomi_workflow`                                      | Plan and markdown surfaces            | Adapt                                            | Workflow/library card with lifecycle badge and expandable playbook                 |
| `takomi_board`                                         | Plan, progress, collection primitives | Custom lifecycle family, not one card per action | Session/action summary, task progress, links to artifacts, expandable plan/result  |
| `takomi_subagent`                                      | Generic collab row is insufficient    | Custom execution family                          | Aggregate progress, per-agent rows, checklist/acceptance state, result disclosures |
| `skill_index`, `skill_manifest`, `skill_load`          | Lists, badges, markdown               | Shared collection card                           | Counts and availability in compact view; grouped list or loaded markdown in detail |
| `policy_manifest`, `policy_load`                       | Same as skills                        | Shared collection card                           | Availability/load status with expandable policy text                               |
| `context_report`                                       | Status, alert, markdown               | Shared report card                               | Health state and attention count; requested report mode in detail                  |

### Pi built-ins and interactive surfaces

| Surface                                                      | Decision                                           | Required refinement                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| File read/edit/write, shell, search, image and generic tools | Keep current specialized/generic work-log behavior | Preserve a universal fallback for unknown tools                                                |
| Pi `select`                                                  | Reuse question UI                                  | Preserve real option descriptions and cardinality                                              |
| Pi `input`                                                   | Adapt question infrastructure                      | Render an actual text field and preserve placeholder/method metadata                           |
| Pi `editor`                                                  | Adapt question infrastructure                      | Render multiline input rather than an option-less question                                     |
| Pi `confirm`                                                 | Reuse approval infrastructure                      | Distinguish a one-time confirmation from persistent permission semantics                       |
| Pi `notify`                                                  | Adapt toast/work-log behavior                      | Preserve source and severity; do not turn every notice into a warning                          |
| Pi widget/status/header/footer/custom chrome                 | Defer from v1                                      | Do not stream terminal-rendered UI. Later define a durable Takomi inspector snapshot if needed |
| Pi/Takomi slash commands                                     | Defer from v1                                      | Add only after a command discovery and argument-schema contract exists                         |

### Optional TakomiFlow tools

Use four shared presentations instead of 19 bespoke renderers:

| Family                | Tools                                                                 | Presentation                                                                        |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Readiness/report      | `takomi_flow_capabilities`, `doctor`, `audit`, `examples`, `selftest` | Status/report card with checks, counts and expandable detail                        |
| Request/configuration | `plan`, `template`, `prepare`, `validate`                             | Prepared-request card with kind, gates, path and validation state                   |
| Execution             | `workflow`, `observe`, `generate`                                     | Long-running execution card with run ID, phase, gate state and completion artifacts |
| History/artifacts     | `inspect`, `latest`, `runs`, `assets`, `review`, `collect`, `report`  | Collection or artifact card with paths, thumbnails and report disclosure            |

## Minimal architecture

### 1. Add one bounded semantic envelope

Introduce a provider-neutral tool presentation payload rather than transporting Pi TUI renderer output or arbitrary unbounded tool results.

```ts
type ToolPresentationEnvelope = {
  schemaVersion: 1;
  namespace: "takomi" | "takomi-flow" | "generic";
  toolName: string;
  family: "status" | "collection" | "configuration" | "lifecycle" | "execution" | "artifact";
  action?: string;
  summary?: Record<string, unknown>;
  detailText?: string;
  artifactRefs?: Array<{
    kind: string;
    path: string;
    label?: string;
  }>;
  error?: {
    severity: "warning" | "error";
    code?: string;
    message: string;
  };
};
```

The final schema should use explicit typed/allowlisted summaries per family and enforce size limits. The loose `Record` above illustrates the boundary, not the final contract.

### 2. Normalize at the Pi adapter boundary

- Recognize exact tool names/prefixes rather than relying only on substrings.
- Extract bounded summaries from Pi `args`, `result`, `details`, and MCP `structuredContent`.
- Preserve MCP provenance explicitly; do not infer it from whether the tool name contains `mcp`.
- Emit the envelope on start/update/end under a stable `toolCallId`.
- Keep unknown tools readable through the existing generic text/JSON fallback.

### 3. Preserve the envelope through projection

Allow `ActivityPayloadProjection` to retain the bounded envelope for all tool item types. Keep full raw tool data server-side; do not send arbitrary extension results over WebSocket.

### 4. Use a descriptor registry and six renderer families

Map tool names/actions declaratively to labels, icons, family, summary selectors and artifact selectors. Build only six composable renderer families. Rich custom components are justified for:

- subagent execution,
- board lifecycle/task progress,
- long-running TakomiFlow execution/artifacts.

Everything else should compose existing T3 primitives.

### 5. Share view models, not platform components

Put envelope parsing and family-specific view-model derivation in a shared package usable by web and mobile. Implement React DOM cards first. A future React Native pass should render the same view models as compact rows with sheets/routes for large details.

## Implementation phases

### Phase 0 — Visual direction gate (next)

No production UI implementation yet.

1. Prepare representative fixture states for:
   - subagent: running, parallel, completed, failed, policy-blocked;
   - board: session created, task progress, blocked, completed;
   - configuration/report/collection cards;
   - TakomiFlow execution and artifact completion;
   - refined single/multi-question and text/editor input.
2. Ask Antigravity for multiple mock-up directions grounded in screenshots/tokens from current T3 Code.
3. Curate relevant 21st Dev primitives as implementation references, not as a replacement design system.
4. Compare all proposals against T3 Code's density, typography, spacing, colors, disclosure behavior, keyboard accessibility and performance constraints.
5. User selects or combines a direction before implementation begins.

### Phase 1 — Contract and adapter fidelity

- Add the bounded presentation envelope to contracts.
- Add exact Takomi/TakomiFlow classification and normalizers in `PiAdapter`.
- Preserve the envelope in activity projection.
- Add focused contract, adapter and projection tests for `takomi_board`, `takomi_subagent`, and one `takomi_flow_*` tool.

### Phase 2 — Generic semantic desktop cards

- Add the descriptor registry.
- Add status, collection, configuration and artifact family renderers to the work log.
- Retain current generic row as fallback.
- Verify lifecycle start/update/end collapse and keyboard-accessible disclosure.

### Phase 3 — High-value rich desktop cards

- Subagent execution card.
- Board lifecycle/task card.
- TakomiFlow execution/artifact card.
- Fixture-driven visual tests for running, success, warning, failure, blocked and partial states.

### Phase 4 — Interactive fidelity

- Preserve extension UI method and notification severity.
- Correct option descriptions and multi-select handling.
- Add proper text and multiline editor input.
- Refine confirmation semantics.

### Phase 5 — Mobile implementation (future)

- Consume the shared envelope/view models.
- Implement concise native rows first.
- Use sheets/routes for board, report, subagent and artifact details.
- Verify remote and multi-device lifecycle updates.

## Acceptance criteria

- Every core Takomi tool has a descriptor or an intentional generic fallback.
- All 19 TakomiFlow tools map to a shared family or fallback.
- Structured summaries for board, subagent and Flow calls survive server projection.
- No arbitrary unbounded result payload is sent to clients.
- Start/update/end states collapse under a stable tool-call identity.
- Warning/error severity is data-driven rather than inferred from display text.
- Questions preserve select/input/editor/confirm semantics.
- Desktop disclosures are keyboard accessible and avoid continuous repainting animation.
- The presentation model has no DOM dependency and can be consumed by mobile later.
- Unknown future tools remain legible without requiring an immediate custom renderer.

## Source evidence

### Takomi suite

- `.pi/extensions/takomi-runtime/index.ts` — runtime tool registrations
- `.pi/extensions/takomi-runtime/tool-renderers.ts` — current Pi TUI runtime renderers
- `.pi/extensions/takomi-subagents/index.ts` — `takomi_subagent` registration
- `.pi/extensions/takomi-subagents/native-render.ts` — current Pi subagent rendering
- `.pi/extensions/takomi-context-manager/skill-tools.ts` — skill tools
- `.pi/extensions/takomi-context-manager/policy-tools.ts` — policy tools
- `.pi/extensions/takomi-context-manager/diagnostics-tools.ts` — `context_report`
- `plugins/takomi-flow/scripts/lib/mcp-tools.mjs` — 19 TakomiFlow MCP tools and `structuredContent`

### Takomi Code

- `apps/server/src/provider/Layers/PiAdapter.ts` — Pi RPC mapping and current tool classification
- `apps/server/src/orchestration/ActivityPayloadProjection.ts` — client payload projection
- `packages/contracts/src/providerRuntime.ts` — provider runtime contracts
- `apps/web/src/session-logic.ts` — web work-log derivation and tool lifecycle collapse
- `apps/web/src/components/chat/MessagesTimeline.tsx` — generic expandable tool rows
- `apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx` — question UI
- `apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx` — approval UI
- `apps/web/src/components/chat/ProposedPlanCard.tsx` and `apps/web/src/components/PlanSidebar.tsx` — plan surfaces
- `apps/mobile/src/lib/threadActivity.ts` — mobile work-log derivation
- `docs/features/takomi-pi-provider.md` — current provider behavior and known limitations

## Explicit non-goals for the first build

- Mobile visual implementation.
- Pixel-for-pixel reproduction of Pi's terminal UI.
- Rendering arbitrary Pi widgets/header/footer/custom components.
- One React component per tool name.
- Sending complete unrestricted tool results to clients.
- Replacing T3 Code's design language with Antigravity or 21st Dev output.

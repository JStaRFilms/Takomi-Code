# B13 — Build web/desktop session and resource UI

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03A, D01, B04, B05, B06, B07, B08, B09, B10, B12

## Objective
Implement the approved web experience; desktop inherits it through the Electron shell.

## Implement
- Provider capability-gated composer controls.
- Environment/workspace commands, templates, and skills in the existing command menu.
- Session picker with bounded search/pagination, Clone-only continuation, source-stability/compatibility warnings, and cancellation. Explain that original-file Attach is unavailable without a Pi lock.
- Historical transcript paging and fidelity disclosure.
- Tree/fork/clone/name/stats/export controls.
- Queue/steer/follow-up, compact/retry/bash controls.
- A direct Run Details right-panel launcher with stable re-entry.
- Existing Settings and command-palette entry points where the same behavior is expected.

Use existing design primitives, preserve responsive layout, and avoid unlimited list rendering or continuously repainting animation. Remote paths must say they belong to the selected environment.

## Tests
Reducer/logic tests plus focused interaction tests for open/close/reopen, focus return, stale capability changes, clone confirmation, explicit Attach-unavailable state, command insertion/invocation, transcript paging, tree selection, and error recovery. Browser validation requires explicit user permission.

## Definition of done
Every approved web journey works without locating an old tool card, and desktop needs no separate duplicate React implementation. Before editing overlapping files, the implementer records/reconciles the human-approved baseline and never resets existing uncommitted work.

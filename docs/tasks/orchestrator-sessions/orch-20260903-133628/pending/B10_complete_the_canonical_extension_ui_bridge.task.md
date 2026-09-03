# B10 — Complete the canonical extension UI bridge

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03, D03

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Make all supported Pi extension interactions reliable remotely and make unsupported TUI requests fail visibly instead of hanging.

## Implement
Preserve only fields actually supplied by the negotiated Pi protocol. For Pi 0.84.4 the complete contract is: `select` title/string options/optional timeout; `confirm` title/message/optional timeout; `input` title/optional placeholder/timeout; `editor` title/optional prefill; `notify` message/optional `notifyType`; `setStatus` `statusKey` plus optional `statusText` (`undefined` clears that key); `setWidget` `widgetKey` plus optional `widgetLines` (`undefined` clears that key) and optional `widgetPlacement`; `setTitle` title; `set_editor_text` text. Add descriptions, previews, defaults, multi-select, or other severity fields only when a future protocol capability explicitly supplies them. Map response-bearing methods to existing approval/question flows and fire-and-forget methods to bounded canonical runtime surfaces.

Classify an unknown method as response-bearing only from negotiated method metadata; otherwise fail closed as a bounded diagnostic and do not invent a response schema. Track request lifecycle so each response-bearing interaction reaches one durable terminal T3 state, duplicates are idempotent, and T3 makes at most one Pi-compatible response-write attempt for the fenced live process generation. Do not claim atomic or exactly-once child-process delivery. Rich `ctx.ui.custom` remains unsupported; remote Takomi clarify must use preview-only plus confirmed launch.

## Tests
Every Pi 0.84.4 method and exact field; `notifyType`; status/widget key replacement and explicit undefined-clear behavior; widget placement; duplicate response; cancel; Pi-owned timeout; reconnect; abort; stale request; unknown method with and without negotiated response metadata; oversized options/widgets; no leaked waiter after process exit. Put previews, multi-select, defaults, and richer severity only in future-version negotiation fixtures that assert they remain unavailable unless advertised.

## Definition of done
No extension request can silently strand a turn, and every client receives the same canonical semantics within its native UI.

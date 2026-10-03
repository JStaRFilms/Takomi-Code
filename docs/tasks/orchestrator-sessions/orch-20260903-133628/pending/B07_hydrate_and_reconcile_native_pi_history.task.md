# B07 — Hydrate and reconcile native Pi history

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B02, B03, B06, D03

## Objective
Show useful pre-T3 history and prevent Pi's resumed context from silently diverging from the visible T3 transcript.

## Implement
Parse Pi entries through versioned schemas into a provider-neutral historical projection. Preserve native entry IDs, parent IDs, roles, text, thinking, tool calls/results, bash, custom messages, compaction/branch summaries, labels, model/thinking changes, and unsupported-entry placeholders. Never expose extension custom-state bodies by default.

Store both append high-water entry ID and active `leafId` in the resume cursor. Maintain separate bounded projections for append-order entries, the complete tree, the selected root-to-leaf branch, and compaction-aware effective model context. On recovery, reconcile entries and leaf before accepting a new prompt, then append idempotent recovered projections or an explicit incomplete/unreconciled event. Page with underlying file/entry/byte ceilings, cancellation, and backpressure; final native entries are authoritative, streaming deltas are not replayed as duplicates. Hydrated history must not fabricate T3 checkpoint refs.

## Tests
Linear and branched fixtures, active-leaf changes without a new high-water entry, full-tree versus active-branch versus effective-context projections, compaction, tool pairs, images, custom entries, unknown future fields, crash after native append/before T3 persistence, repeated recovery, truncated final line, large history ceilings/backpressure, missing historical checkpoints, and sensitive custom-state redaction.

## Definition of done
After restart the model cannot know unseen native history without Takomi Code displaying either that recovered history or a prominent reconciliation warning.

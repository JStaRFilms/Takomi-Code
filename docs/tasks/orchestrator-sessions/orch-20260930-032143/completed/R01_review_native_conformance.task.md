# R01: Review the native conformance slice

## Agent setup

Read-only reviewer in `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read root AGENTS.md, session master_plan.md, B01 packet/report, current two-file diff against HEAD and relevant test/helper context. Use unslop. No edits, commits, subdelegation, installs, live sessions, browsers or unrelated checks. Return review inline; parent saves it.

## Objective and scope

Review only `apps/server/src/provider/Layers/PiProtocolConformance.test.ts` and `PiProtocolConformance.ts` against B01. Frozen 0.84.4 fixtures must not be relabeled; installed 0.99.1 must have explicit attributed native expectations, meaningful method/hashes/path/native copy proofs, missing-method rejection and honest unsupported target behavior. Confirm that new validation is not tautological compatibility proof, helpers cannot affect provider runtime behavior unexpectedly, and error reporting is bounded to synthetic fixture/native package metadata.

The builder reports standalone 10/10 and exact eight-file set 114/114, typecheck/format/diff green. It also reports current changed-file lint has 10 existing errors plus one warning at unchanged imports/process.platform/reverse, and explicitly left B01 blocked on that pre-existing debt. Verify diagnostic provenance against HEAD, not merely the report. Do not repair unrelated baseline lint in this task or recommend suppression. State whether any diagnostics are introduced by new code and whether there is a confirmed blocking regression in this slice. If the unchanged lint baseline blocks acceptance, identify the narrow reason separately from actual source defects.

## Definition of done

Return confirmed correctness/security/requirement defects with exact locations and evidence, or explicitly no blocking source findings. Distinguish checks actually rerun from prior builder evidence, baseline debt from regressions, and synthetic/native proof from model/client proof. Skip stylistic speculation and tooling-enforced suggestions. Under 1200 words. Expected artifact is a returned focused review, no reviewer-written files.

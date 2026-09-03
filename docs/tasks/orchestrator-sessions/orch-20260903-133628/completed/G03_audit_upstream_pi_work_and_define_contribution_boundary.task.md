# Task G03: Audit Upstream Pi Work and Define the Contribution Boundary

## 🔧 Agent Setup (DO THIS FIRST)

### Workflow to Follow
Vibe Genesis — evidence gathering and architecture correction.

### Prime Agent Context
- `master_plan.md`
- `Audit_Summary.md`
- `Upstream_Strategy_and_Resilience_Addendum.md`
- Upstream PR refs `upstream/pr-7211` and `upstream/pr-6461`

### Optional Skill / Context Overlays
| Overlay | Why |
|---|---|
| agent-engineering | Produce implementation guidance that weaker agents can execute safely. |
| code-intelligence | Compare independent provider implementations and their blast radius. |

**Stage:** Genesis
**Depends on:** G01, G02

## Objective
Determine whether upstream has already implemented Pi, identify reusable work and residual risks, and separate generic upstreamable Pi support from Takomi-only product behavior.

## Scope
- Upstream issues and PRs for Pi, ACP, extension architecture, and sessions.
- Snapshot comparison between the fork, PR #7211, and PR #6461.
- Generic Pi versus Takomi dependency and contract boundaries.
- Upstream contribution strategy.

## Context
PR #7211 is a substantial, active Orchestrator V2 Pi implementation and supersedes many older attempts. The fork is an independent implementation with Takomi-specific behavior embedded in generic Pi paths.

## Definition Of Done
- Leading upstream work and its status are identified with URLs.
- Planned tasks already covered upstream are marked for re-evaluation rather than duplicate implementation.
- Remaining safety and fidelity gaps are explicit.
- Generic Pi code is forbidden from importing or recognizing Takomi.
- A practical non-competing upstream contribution sequence is documented.

## Expected Artifacts
- `Upstream_Strategy_and_Resilience_Addendum.md`
- Updated `master_plan.md`
- Updated task DAG and packets.

## Constraints
- Do not cherry-pick a large provider stack across incompatible orchestration architectures.
- Do not open or promise an upstream PR without explicit authorization.
- Preserve attribution from existing upstream contributors.

## Verification
- Inspect PR metadata, files, checks, and branch ancestry.
- Confirm the fork and #7211 do not share Pi implementation ancestry.
- Review the resulting boundary against B01–B18.

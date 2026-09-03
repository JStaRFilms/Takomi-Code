# G02 — Demonstrate read compatibility and choose the boundary

**Role:** Architect
**Stage:** Genesis
**Depends on:** None
**Status:** Completed by the planning audit

## Objective
Demonstrate that a CLI-created Pi session can be selected and read through a non-terminal host without rewriting its history, then identify the remaining continuation proof.

## Procedure performed
A real Pi session was copied to a unique temporary directory. Pi 0.84.4 was started in RPC mode against the copy with extensions disabled. The audit requested state, entries, tree, and commands. All requests succeeded; Pi reported the copy as active; 61 native entries were returned; the copy's byte count did not change.

## Decision
Keep Pi in an isolated child process and never append to JSONL from T3. The experiment proves read compatibility only. B02/B06 must still prove prompted continuation, parent-link correctness, restart, and Takomi custom-state restoration. A maximum-fidelity session uses one long-lived public-SDK host as sole owner; stock RPC remains a reduced-capability compatibility transport for other sessions, never a concurrent second owner.

## Definition of done
Read compatibility is demonstrated without claiming prompted continuation; the remaining proof is assigned to B02/B06.

## Checklist
- [x] No real session was opened for writing
- [x] RPC baseline was exercised
- [x] Session copy was opened and inspected
- [x] Entry/custom/model/thinking records survived
- [x] Single-writer limitation documented
- [x] Architecture boundary selected

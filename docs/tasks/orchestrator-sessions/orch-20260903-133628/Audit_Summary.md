# Audit Summary

## Verdict

The current fork has a strong Pi RPC foundation, but it is not yet a 1:1 Pi/Takomi product surface. The plan is now structured to close behavioral, session, resource, control, client, packaging, and verification gaps without claiming impossible terminal-UI parity.

## What is already real

- Structured Pi JSON-RPC transport, not terminal scraping.
- Prompt/text/reasoning/tool/image streaming.
- Model and thinking-level discovery/switching.
- Extension confirm/select/input/editor and notifications.
- Interrupt and persistent session-file resume for T3-created sessions.
- Bounded Takomi semantic cards and web inspector.
- Companion extension discovery in suite mode.

## Most important corrections from independent review

- The audit proof demonstrates session selection/read compatibility, not prompted continuation; B02/B06 now require the missing continuation/restart proof.
- Stock original-file Attach is removed. Pi 0.84.4 has no enforceable cross-process lock, so safe CLI-to-UI continuation clones through Pi and leaves the source untouched.
- Maximum-fidelity sessions use one long-lived isolated public-SDK Pi Host as sole owner. Stock RPC is a reduced-capability alternative, never a concurrent second owner.
- Resume state tracks append high-water and active leaf separately; T3 models full tree, active branch, effective context, and missing historical checkpoints separately.
- Direct Takomi UI controls require a deterministic public Takomi control API; they may not ask the model to call a tool.
- Every new method needs explicit RPC authorization, opaque environment-bound IDs, canonical path checks, and file/byte/time limits.
- B00 blocks Build until current uncommitted work is protected and Takomi source/manifests/licenses/dependency integrity are version-controlled.

## Stage gate

- Genesis: complete.
- Design D01-D03: pending your approval to launch.
- Build B00-B19: pending; B00 is the first hard gate.
- Final review R01: pending.

No implementation work was launched by this session.

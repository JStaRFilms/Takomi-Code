# B04 — Discover Pi commands, templates, and skills

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01, B02

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Populate the existing provider `slashCommands`, `skills`, and workspace snapshots with Pi/Takomi resources using Pi as the authority.

## Read first
Pi skill and prompt-template docs, RPC `get_commands`, Takomi skill registry behavior, Codex/Claude skill discovery, `packages/client-runtime/src/providerSkills.ts`, web/mobile slash search, and provider snapshot caching.

## Implement
- Probe `get_commands` in a no-session or disposable RPC process and classify extension commands, prompt templates, and `/skill:name` entries.
- Obtain skill metadata through supported Pi/Takomi metadata or bounded filesystem discovery on the environment host; preserve description, path, scope, enabled, user-only, and user-invocable semantics.
- Exclude built-in TUI commands that RPC cannot execute unless T3 provides a dedicated action.
- Cache by provider instance + cwd + resource/config fingerprint; refresh on settings/resource change.
- Surface Pi project trust explicitly. In RPC mode, default `ask` may omit protected project resources unless trust was previously saved or deliberately configured.
- Return discovery status/errors without failing the whole provider snapshot.
- Deduplicate commands and skills according to Pi's first-wins behavior.

## Tests
Global/project precedence, saved/ask/rejected trust, trusted/untrusted project resources, duplicate names, malformed frontmatter, user-only and model-only skills, templates with argument hints, extension commands, remote environment paths, bounded discovery deadlines, and stale refresh.

## Definition of done
Web and mobile existing menus can show and invoke only commands/resources that the active Pi environment can actually execute.

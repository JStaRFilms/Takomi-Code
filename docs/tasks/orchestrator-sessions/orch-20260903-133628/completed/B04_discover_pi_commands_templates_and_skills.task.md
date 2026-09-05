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

## Implementation evidence

- Project-neutral machine snapshots never publish cwd resources. Exact-cwd discovery failures return unavailable, remove stale workspace resources, and retry without falling back to another cwd.
- Pi 0.84.4 `get_commands` remains authoritative for extension commands, prompts, and skills. Raw host paths remain server-only and wire-visible resource locations are opaque IDs.
- Metadata reads are capped by resource count, per-file bytes, and aggregate bytes. One discovery deadline budgets startup, RPC, enrichment, trust inspection, and process teardown.
- Trust diagnostics follow explicit approve/no-approve precedence and canonical nearest saved entries, while saved/default outcomes are labeled partial because extension-handler decisions are not observable over RPC.
- Pi explicitly advertises exact-cwd snapshot freshness, so only Pi gets the shared five-minute client TTL. Other providers retain their snapshots rather than entering an unsupported expired-refresh loop; registry refreshes remain deduplicated, settings rebuilds clear snapshots, and failed Pi stale refreshes can be retried.
- Focused resource/provider/adapter/client/mobile tests: 61 passed. Focused registry invalidation test: 1 passed (40 skipped). Server, contracts, client-runtime, web, and mobile typechecks passed; focused lint, formatting, and `git diff --check` passed.

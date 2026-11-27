# Takomi Code branding and compatibility boundaries

`Takomi-Code` is a branded fork of T3 Code that regularly merges `upstream/main` and runs in mixed
fleets alongside stock `T3 Code` servers, desktop apps, and mobile clients. Globally renaming
`T3 Code` breaks wire compatibility, misattributes upstream services, and creates unnecessary
upstream merge conflicts.

Use the three-tier rule below whenever you add copy, resolve upstream merge conflicts, or audit
branding on the `Takomi-Code` branch.

## Three-tier naming rule

### 1. Always `Takomi Code` (this fork's identity and provenance)

Use `Takomi Code` when the text identifies **this running app, server, or sender**:

- Local web, desktop, and mobile UI chrome, window/boot errors, download/issue URLs
  ([`apps/web/src/branding.ts`](../../apps/web/src/branding.ts)), and OAuth callback HTML pages.
- Local server self-identity, error guidance, and fallback git author/committer metadata.
- Agent `<runtime_info>` instructions
  ([`packages/provider-core/src/server/runtimeInstructions.ts`](../../packages/provider-core/src/server/runtimeInstructions.ts)).
- Message sender provenance (`withMessageSenderNote` in
  [`packages/contracts/src/orchestrationV2.ts`](../../packages/contracts/src/orchestrationV2.ts)),
  timeline `"Sent by Takomi Code"` attribution, and screen-reader author announcements.
- Outbound cross-machine peer link client names
  ([`apps/server/src/peer/PeerLinks.ts`](../../apps/server/src/peer/PeerLinks.ts)).

### 2. Neutral or distribution-aware (remote hosts and peers)

A Takomi Code client can connect to either a Takomi Code server or a stock T3 Code server, and
linked environments can mix both distributions. Never hardcode `Takomi Code` when describing a
remote host whose distribution is unknown:

- When `environment.distribution` is available (for example in
  [`SettingsEnvironmentDetailRouteScreen.tsx`](../../apps/mobile/src/features/settings/SettingsEnvironmentDetailRouteScreen.tsx)),
  render the matching product name (`Takomi Code` or `T3 Code`) with a neutral `Server` fallback.
- When the remote distribution is not known (connection diagnosis, managed-update status in
  [`contractLabels.ts`](../../packages/client-runtime/src/contractLabels.ts), multi-machine update
  tables in [`UpdateEverythingDialog.tsx`](../../apps/web/src/components/sidebar/UpdateEverythingDialog.tsx),
  remote-host update banners, and peer compatibility errors), use neutral wording such as
  `"the server"`, `"your server"`, or `"App"`.

### 3. Always keep `T3 Code` / `t3-*` (compatibility, truthful ownership, merge boundaries)

Leave the upstream name or identifier intact when changing it would break compatibility, misstate
who operates a service, or create high-churn upstream conflicts:

- **Internal and persisted identifiers:** `@t3tools/*` packages, the `t3-code` MCP server name,
  `t3_*` MCP tool names, `t3-thread://` URIs, `T3CODE_*` / `T3_*` environment variables, and the
  `t3` CLI shim plus its ownership marker
  ([`DesktopCliShim.ts`](../../apps/desktop/src/app/DesktopCliShim.ts)).
- **Upstream services and legal ownership:** `T3 Connect` relay/tunnel branding, the upstream
  privacy policy link
  ([`SettingsPanels.tsx`](../../apps/web/src/components/settings/SettingsPanels.tsx)), telemetry and
  crash diagnostics sent to the T3 team, `t3_feedback`
  ([`tools.ts`](../../apps/server/src/mcp/toolkits/feedback/tools.ts)), and the registered GitHub
  OAuth app `"T3 Code for GitHub"`
  ([`definition.ts`](../../packages/source-control-github/src/shared/definition.ts)). Renaming copy
  does not change who receives data or owns the endpoint.
- **External installed names and stock presets:** The GNOME Shell extension `"T3 Code SnapShots"`
  ([`metadata.json`](../../apps/desktop/gnome-extension/metadata.json),
  [`SnapShotSetupDialog.tsx`](../../apps/web/src/components/settings/SnapShotSetupDialog.tsx)) and
  the stock `"T3 Code"` (`t3-code`) theme preset.
- **Protocol and upstream-only surfaces:** Provider `clientInfo` / OAuth client hints, orchestration
  instruction tags and headings
  ([`orchestrationInstructions.ts`](../../packages/provider-core/src/server/orchestrationInstructions.ts)),
  upstream issue-triage playbook prompts, and `apps/marketing/`.

## Cross-machine peer-link provenance

Linked machines identify themselves using the sender's own prefix (`LINK_CLIENT_NAME_PREFIX = "Takomi Code · "` in
[`PeerLinks.ts`](../../apps/server/src/peer/PeerLinks.ts)). Because the sender controls the prefix:

- Prompts sent from a Takomi Code machine show `Takomi Code · <machine>`.
- Prompts sent from a stock T3 Code machine still accurately show `T3 Code · <machine>`.

To keep mixed fleets interoperable, client-name parsing in
[`PeerClientPairing.ts`](../../apps/server/src/peer/PeerClientPairing.ts) strips **both**
`"Takomi Code · "` and legacy/stock `"T3 Code · "` prefixes, and unlink confirmation copy in
[`LinkedEnvironmentsSettings.tsx`](../../apps/web/src/components/settings/LinkedEnvironmentsSettings.tsx)
references both prefixes. Do not narrow either side to Takomi-only.

## Agent `<runtime_info>` and replay fixtures

[`runtimeInstructions.ts`](../../packages/provider-core/src/server/runtimeInstructions.ts) emits
`Takomi Code` in `<runtime_info>`, while upstream provider replay `.ndjson` fixtures still contain
stock `T3 Code` `<runtime_info>` lines.

To avoid editing upstream fixtures on every merge,
[`ReplayRuntimeInstructions.ts`](../../apps/server/src/orchestration-v2/testkit/ReplayRuntimeInstructions.ts)
materializes the current `<runtime_info>` instructions into replay fixtures at test time. Keep
upstream `.ndjson` fixtures untouched unless a fixture directly asserts Takomi-branded outbound
sender frames (such as delegated-task sender notes).

## Translation and lint traps

- **Lint allowlist:** `"Takomi Code"` is listed in `PROPER_NOUNS` in
  [`no-untranslated-copy.ts`](../../oxlint-plugin-t3code/rules/no-untranslated-copy.ts) so UI strings
  naming the product do not trip `t3code/no-untranslated-copy`.
- **Silent English fallbacks in i18n catalogs:** `vp run i18n:generate` hashes English source
  strings to generate translation keys. Changing an English string (for example from `T3 Code` to
  `Takomi Code` or neutral wording) creates a new key whose value defaults to **English** in all
  nine non-English catalogs (`de`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `sv`, `zh`).
- **`i18n:check` does not catch English fallbacks:** `vp run i18n:check` validates key parity and
  English source matching, not whether non-English entries stayed translated. After changing any
  translated string, carry existing translations forward from git history to the new keys and update
  the wording across all nine locales, then verify against the base commit that no translated entry
  silently reverted to English.

## Branch and upstream-merge scope

- Keep all Takomi branding on `Takomi-Code`; do not copy it into the dormant `feat/pi-debrand`
  stock branch (see [Takomi Code handoff](./takomi-code-handoff.md#branch-model)).
- When syncing with `upstream/main`, apply the three-tier rule to newly introduced upstream copy and
  audit non-English i18n catalogs as part of the post-merge audit in
  [`.agents/skills/takomi-upstream-migration/SKILL.md`](../../.agents/skills/takomi-upstream-migration/SKILL.md).

# Task 27: Make Vault private-entry copy readable

## Objective
User explicitly says fix this now after the label fix still looked confusing. Live screenshot has field name then one paragraph containing destination, technical purpose and privacy note. Root web ComposerPiSecretInputCard renders question in a normal p, collapsing server newlines. Also our old exact test prompt forced machine-style names and technical purpose. Do not pretend app can infer arbitrary secret values or override exact user request text.

## Prime context
Read AGENTS, Tasks24-26, .t3/vault-code-backups/round3-labels/result.md, packages/provider-pi/src/server/adapter.ts, native tests/fixture. Read apps/web/src/components/chat/ComposerPiSecretInputCard.tsx and its behavioral test, ComposerPendingUserInputPanel.tsx, apps/mobile/src/features/threads/PiSecretInputCard.tsx and client-runtime private request tests. Installed approved source files are C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and secret-input.ts; no others.

## Scope and direction
Make a narrow readability pass, not a new form system. Use existing question/header strings and current safe display metadata. Give a direct field instruction, separate destination from purpose and privacy notice using clear line/paragraph breaks. Do not repeat the whole field request again in a wall of text. Preserve actual field identifier because it is authoritative; don't hardcode TKM prefix stripping, infer unknown credential types, invent expected values/examples, add friendly-label/description API/schema fields, or rewrite the agent's meaning. The old exact prompt can still produce technical words; describe that limitation honestly and provide simpler future testing instructions.

Web secret card must preserve intended whitespace/paragraphs and use existing typography/layout. Input accessibility label should identify requested field where appropriate. No oversized cards, new UI variants, animations or broad composer changes. Native Text already preserves newlines; decide if any mobile code change is truly necessary and keep it minimal. Desktop wraps web. Preserve archive/legacy generic prompts, file upload, private component state, submit/cancel/errors, environment routing and no composer draft/history persistence. No response or permission changes.

Improve vault_request agent-facing purpose/field guidance in the approved tools.ts only if useful: explain in plain language which credential/value is needed and why, concise one/two sentences rather than technical mechanics; say what to enter before asking where possible. Keep required real API/OAuth field identifiers, don't invent dummy prefixes for ordinary username/token requests, don't ask to paste credentials in chat or put values in purpose. Do not promise descriptions override a user's exact requested text or inject-only is an OS/network sandbox. No change to execute, grants/store or ownership protocol unless formatting requires it.

## Definition Of Done
Behavioral component checks for accessible field instruction and readable question paragraphs, preserving secret input isolation and submit/cancel flow. Do not add static markup/class-only/prop-wiring tests. Existing native installed-code conformance uses actual runRpcMode/outputguard and strict persistence mocks; updated assertions match deliberate copy changes, no private values/raw native titles/correlation leaks. Run focused web/private-card and adapter tests, provider and installed-code types, scoped web check if justified, lint/format/diff. No repo-wide checks. Apply unslop for UI/doc wording.

## Expected Artifacts
Small existing adapter/web/test changes and optional authorized installed tools.ts description edit, existing feature explanation only if needed. Round4 code-only snapshots/diffs/result under ignored .t3/vault-code-backups/round4-readability, preserving all previous snapshots and unrelated changes. Return exact surface decisions and build requirements. Do not build now: unlike R3 this UI source edit requires a fresh isolated web client as well as server.

## Constraints
No credentials/Vault/auth/session/settings/env/signing/.npmrc data, real SDK/model/Vault queries, network/install/accounts/popup, server/provider/browser/device/app launch/restart, builds, commits/push/CI/npm/GitHub publication or agents. No external writes except the two authorized installed code paths. Protect apps/server/dist, apps/web/dist, .t3/vault-rpc-preview-r2/server and .t3/vault-rpc-preview-r3-labels/server. No cleanup of dependencies/worktrees/Ctp. User's running app/testservers stay untouched.

## Dependencies and checkpoint
User-reported A-D functionality passed, native113 tests/types/review passed for R3, label context appeared live but its readability is now the issue. One implementation pass and one focused parent/reviewer check, then isolated server AND web build with no env-file imports or generated route-source writes. No browser/device verification without explicit permission. User manually tests the new entry after artifact checks.

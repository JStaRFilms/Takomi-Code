# Implement reusable Vault grants

## Context

The user approved a specific grant policy, then explicitly authorized implementation, isolated tests, a scoped Suite commit and code-only sync to the installed extension. No implementation existed at approval. The app README commit is unrelated.

Current Vault grants use arbitrary operation strings as authorization checks. The session shutdown hook revokes every session grant in a shared store. The requested change must remove that confusion without exposing secrets or broadening previously approved grants.

This is a bounded change to one extension and its focused tests, not a full-project rewrite. Start with one read-only architecture task. Author implementation and review packets after the SDK identity and compatibility plan is verified.

## Objective

Make grant duration and permitted access clear. Reusable chat grants survive retries and ordinary process restarts, remain isolated across chats and expire at a visible time. Deliver tested source, reviewed installed code and a scoped commit. Do not claim that an app build distributes the separately installed Vault extension.

## Scope

Authoritative Suite: `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`.

Approved changes: `.pi/extensions/takomi-vault/`, focused Vault tests and qualifying feature documentation in that repository. Installed code-only target: `C:/Users/johno/.pi/agent/extensions/takomi-vault/`.

The app checkout is the coordination workspace. All Suite subprocesses must specify the Suite cwd. Preserve unrelated dirty skill and ai-media work. Do not touch actual private state at `C:/Users/johno/.pi/agent/takomi-vault/`, signing files, credentials, settings or live sessions.

## Approved policy

- Default: this chat, up to 12 hours, reusable across messages, tasks and ordinary process restarts.
- Alternatives: one attempt within 5 minutes; 15 minutes in this chat; explicit remember for 30 days across chats using the same Vault.
- Preserve approved credential, service/destination, fields and command/file access restrictions. Credential access does not authorize deployments, deletion or other actions.
- For newly approved policy, operation prose explains purpose rather than acting as an arbitrary exact-string permission check.
- Existing narrow grants must not silently gain broader access.
- Reusable approval survives command failure. Preserve atomic once spend-before-effect.
- Bind chat grants to a trusted stable conversation owner, not model input or a generic agent string. New chats and forks do not inherit them.
- Another session shutting down cannot revoke unrelated grants. Ordinary process restarts must not end chat approval.
- Revocation remains available. Saving a credential and approving use remain distinct choices.

## Execution plan

1. Inspect source, installed-code parity, existing dirty work and public SDK context/lifecycle APIs. Produce a minimal schema and compatibility plan with exact acceptance tests.
2. Implement the verified plan in Suite. Add focused isolated tests and update architecture/schema reasoning in the existing feature documentation where appropriate. Keep changes inside the approved Vault scope.
3. Run one focused review for identity, expiry, scope, legacy compatibility, private input and failure behavior. Fix confirmed blockers only.
4. Parent verifies relevant tests/types and inspects the exact diff. Perform hash-gated, backed-up, code-only installed sync. Verify source/installed parity.
5. Commit only relevant Vault source, documentation and tests in Suite. Preserve unrelated files and existing staged work. No push, publication, app build or restart is authorized.

## Checklist

- [x] Verify SDK identity and backward-compatible grant design.
- [x] Implement policy with clear approval labels and trustworthy ownership.
- [x] Prove retries, expiry, revocation, forks, restarts, once spend and legacy behavior with isolated tests.
- [x] Complete one focused review and relevant type checks. The single unsaved-reapproval blocker was corrected and verified by a negative control.
- [x] Sync reviewed installed code without runtime data access. Eight files replaced with verified backups; all sixteen code-file hashes match source.
- [x] Commit the approved Suite packet and report exact checks and adoption limits. Local Suite commit: `3d816f8dd0a3e7cc50c28cfde47d40aac8e4b67d`. No push or publication.

## Acceptance criteria

Chat identity survives normal restarts and differs for new/forked chats. Unsupported identity fails closed for chat scopes. Existing narrow grants retain their restrictions or fail closed without private-state migration. New purpose wording does not invalidate approved reusable access. The true duration and permitted access are visible. Atomicity, private entry ownership, plaintext restrictions and ordinary action permissions remain intact.

All tests use synthetic credentials and isolated stores. No actual Vault calls or live SDK/auth sessions. Focused tests/types pass, installed code matches reviewed source, and the commit excludes unrelated changes and private files.

## Risks and review

Durable ownership and legacy scope compatibility are the primary security risks. Verify public SDK APIs against Suite 0.99.1 and installed 1.1.0 declarations without upgrading. Do not invent fields or import SDK internals in production. Stop only for a genuinely different security decision or missing trustworthy owner API.

Existing Pi children are not restarted and may retain older loaded extension code. A separate Suite/package rollout to other machines is not included in this authorization.

## Deliverables

Keep task research and review evidence under ignored APP `.t3/vault-grant-policy/`. Use Suite feature docs only for durable design/schema reasoning. Record task IDs, checks, source/installed hashes and the final commit. No installed-device or live-service success claims.

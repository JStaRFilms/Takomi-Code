# Task 36: Verify final local artifact handoff

## Objective
Close user-requested autonomous Vault repairs and desktop/mobile builds with parent-run artifact checks, not a claim of live installation or device behavior. Execution was direct in the parent, no further agent launched.

## Scope
Read public EXE/APK bytes and metadata, code-only manifests, Suite/installed parity and all five protected runtime tree baselines. No runtime Vault/auth/model/session/credential data or user-process changes.

## Definition Of Done
Completed: Windows146757637bytes/hash/PE/no Authenticode and builder58payload/16sidecar validation. Android76654515bytes/hash/native apksigner verification/samepriorDebugcert/16KBalignment/package2.0.0code3/arm64/ZIPCRC/actualembeddedbundle hash. Desktop rehashed afterAndroid. Source/global six-file parity matches approved manifest. All five runtime hashes/counts unchanged. Initial combined timeout was resolved by split scans; batch quoting failure resolved by direct apksigner.jar invocation.

## Expected Artifacts
.t3/vault-code-backups/round5-operations/final-verification.md records names/SHA, source tests/review/sync, corrections and limitations. Both installables in release/local-20261012173546.1791826546846; logs/provenance under .t3/local-build-logs.

## Constraints and limitations
No publication/commit/push/install/browser/device/app/server/provider launch or restart. Windows unsigned; Android Debug-signed Preview. Global extension host-local, not bundled; oldPi children not reloaded. Desktop offline dependency prep accidentally touched root ignored node_modules; source/protectedoutputs unchanged and rollback avoided. Android earlyowned cleanup retries overlapped; finalbuildserialafterattemptsexited. Reported transparently.

## Review checkpoint
Focused review passed before globalsync. Four isolatedSuite scripts,113Suite-native+113installed-native and SDK/fixture declaration checks passed; previous14client tests/types passed. Artifact checks complete build handoff; user installation/live-service checks remain separate.

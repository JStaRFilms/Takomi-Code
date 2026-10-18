# Recognize SDK 37 signer certificate output

## Objective
Fix the source-confirmed final Android certificate verification failure without weakening signing validation. The real build38122370869 completed Gradle assembly successfully but failed verifyAndroidApk. Parent reproduced the exact parser failure with a disposable fake PKCS12 RSA key and tiny native APK using installed Android build-tools37.0.0.

## Evidence
Native apksigner verify returned success and Number of signers1, v2/v3 verified true, and printed `V3.0 Signer: certificate SHA-256 digest: <fingerprint>`. That fingerprint exactly equalled SHA256 of keytool DER export for the same fake alias. The current parser only recognizes `Signer #N certificate SHA-256 digest:` and therefore produces zero matches. No real signing keys/passwords were read. Fake files were created and deleted in the context tool sandbox.

## Prime context
Read AGENTS, scripts/build-android-artifact.ts certificate matching around157–161 and signing/verify sequence, scripts/build-android-artifact.test.ts existing certificate/multisigner validation. Current source commit20095eada7; no agent active. Vault deferred.

## Scope
Accept the observed SDK37 V3.0 signer certificate label as well as existing numbered signer labels. Preserve exact expected fingerprint equality, rejection of multiple/unknown/wrong/missing signers, signature validation exit status, no plaintext logging or credential reads. Do not generalize to speculative scheme labels, add dependencies, bypass checks, rekey or change Android identities/version/SDK/toolchain. Preserve source stamp handling according to existing behavior. Keep error diagnostics useful if parser finds no supported certificate, but do not expose private subprocess output.

## Completion criteria
Focus regression with native observed output passes; legacy output and wrong/multiple/missing certificate cases continue to behave correctly. Scoped tests/typecheck/lint/format pass. Parent then repeats the real disposable native-tool probe against changed code, not only a synthetic string fixture.

## Expected artifacts
Minimal helper and test diff plus precise check report. No APK compile or full native build needed in this task.

## Constraints
Only source-writing agent. No actual Vault/signing/password/.npmrc/env secrets reads or requests. No outside files except tool-managed temporary fixtures; no production/account/worktree changes, real APK installation, browser/app/server launch, commits/pushes/CI dispatch/releases. User explicitly authorized iterative corrections and build-only retries, not publication or security bypass. Parent reviews, pushes skip-ci and dispatches one signed build-only verification afterward.

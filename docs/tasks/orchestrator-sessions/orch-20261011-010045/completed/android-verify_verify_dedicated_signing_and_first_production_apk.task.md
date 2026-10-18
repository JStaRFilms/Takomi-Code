# Verify dedicated signing and first production APK

## Objective
Build a production Android0.1.2 APK signed by the dedicated key, without publishing npm packages or a GitHub release. User explicitly authorized remaining key/secrets/build steps and generated local password after cancelling private entry.

## Scope and existing results
Dedicated encrypted PKCS12 key and protected password file created inside this repo's ignored .t3/release-signing. Windows ACL restricts the directory to JOHNSAX\johno and SYSTEM. Backup key at .t3/release-signing/backup/takomi-code-android-release.p12 matches SHA256 and opens with the saved password. This is a same-disk backup, not disaster recovery; user should retain a separate encrypted copy and password-manager password. Four signing secrets configured via gh stdin only in JStaRFilms/Takomi-Code, with verified authenticated owner. No values echoed.

## Build
Commit8522bf3d5d91db36ded2238697a0e7b25ebd48ef contains56reviewed source/doc/test files, not task packets or signing material. Push succeeded with prompts disabled and explicit JStaRFilms credential username. Push run38116757783 builds debug previews. Manual run38116763142 uses version0.1.2,publishfalse,android_signedtrue. A narrowly added tested signed-verification input uses production Android credentials without enabling either publisher.41focused tests/scripts typecheck/lint/format/diffcheckpassed for that gate.

## Definition of done
CI Android assembly and signature/manifest/native payload checks succeed, expected signed production APK is present and reported. Parent independently checks artifact metadata/certificate where available. No app installed or silent Android upgrade claim. Device data-retaining upgrade remains user verification.

## Safety and handoff
No automatic retries of uncertain launches or partial publications. IfCI fails, inspect exact failure before narrow fixes; do not duplicateactive builds. No new release publication/tag/npm latest changes without approval. Preserve all other worktrees and live state. Public release0.1.1 remains unchanged. Secrets and local signing files never enter Git, logs or artifacts.

## Expected artifacts
Actions artifact takomi-android-arm64 containing Takomi-Code-0.1.2-android-arm64-v8a.apk, along with build-only Windows/server previews. Key backup paths reported clearly. Parent records CI result and any remaining signing/build blockers.

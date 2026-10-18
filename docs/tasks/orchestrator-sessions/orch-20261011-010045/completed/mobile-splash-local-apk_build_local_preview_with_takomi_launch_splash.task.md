# Build local Preview with Takomi. launch splash

## Objective
Build a fresh local Android Preview containing the phone-verified Takomi Send correction and newly reviewed Takomi. splash wordmark. User requested splash replacement and local testing. No publication or signing key changes.

## Prime context
Read AGENTS, scripts/local-build.ts and docs/user/local-builds.md. Existing successful APK with Send fix is release/local-20261011.1791726202854/Takomi-Code-Preview-2.0.0-d92e9bd5-20261011.1791726202854-dirty.apk; keep it. Root HEADd92e9bd5a5 plus three uncommitted Send changes, mobile appconfig/export script changes, and three staged newwordmark assets. New light PNGSHA256cd79216359e40833d9f6d6351c1f2221832306ec1f355e95a391d185f20e6db4; dark2f94bbdc82816e526f208039d92a5d7da84e64fd57e5e1d357809b55a91694c2. Parent independently checked dimensions/transparency,62.7px circular safe margin and reproducibility.41focusedbrand/Android tests/scripts+mobiletsc/lint/fmt passed.

## Scope
Run node scripts/local-build.ts --android once. Only reset/clean already authorized managed C:/takomi-local-build after marker/commonGitdir/registration checks. Existing C:/tp dependency cache may be reused normally; never reset/clean/delete it or touch unrelated worktrees/main. Builder copies tracked live files including staged SVG/PNGs and unstaged tracked changes.

## Completion criteria
New unique debug-signed Preview APK under release/local-* exists, nonzero withSHA256. Sourceoverlay includes exact reviewed wordmarkassets/appconfig and Send fix. Verify package .preview/arm64/embeddedJS/native signature. Check generated Android splash drawable images derive from new wordmark, e.g. renderedresource pixels compared with newsource at expecteddensity, not only package identity. Parent independently verifies artifact and user tests launch; do not claim phone appearance verified.

## Expected artifacts
APKpath,size,hash, ignored log under.t3/local-build-logs, source/assetoverlayhashes and generatednative splashcheck. No sourcecommit/push/CI/release/npm changes.

## Constraints
Only active build worker. No product-source edits, broad process kills, browser/app/emulator/server/device/install, Vault/signing/password/env/.npmrc reads, credentials/account changes or liveuserdata writes. Native build logs redirected to ignored file; report only relevant redacted lines. Authentication noninteractive. Stop on ownership/access errors. If compile fails report concrete cause; parent coordinates narrow corrections. Preserve old APKs. No global export-icon generator invocation because it regenerates unrelated legacy launcher assets.

## Review checkpoint
Parent checks finalartifacthash and stagedsourceoverlay. NewAPK remains Preview2.0.0 with unique build stamp, not a publishedstable0.1.2 replacement. Send regression alreadyuserverified; splashappearance needs userverification.

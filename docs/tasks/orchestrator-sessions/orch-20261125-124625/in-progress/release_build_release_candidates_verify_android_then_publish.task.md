# Build release candidates, verify Android, then publish

## Objective
After the migration passes review, ship the fork's supported artifacts and give the owner an APK to install before stable publication.

## Scope
Read docs/operations/takomi-release.md and inspect the final .github/workflows/takomi-release.yml and origin before any external action. Confirm the exact reviewed commit, destination branch, unused stable version, supported build matrix, npm trusted publisher setup and whether the existing stable Android signer is available. The owner's release objective does not change the running Tailscale server or authorize an unrelated hosted deployment, Play Store submission, or secret changes.

## Sequence and verification
1. Finish migration review and commit locally. Confirm push target before the first push. Use the fork's build-only GitHub Actions run, no publication, and monitor Actions by run ID using the available watch tools. Inspect failures before retrying. Preserve the reviewed commit for release.
2. Give the owner the Actions artifact link, APK and what to test: install, launch, pair over Tailscale and run a short turn. If testing an upgrade of an existing stable install, use a build-only signed candidate with the established signing key instead of asking the owner to uninstall for a debug APK. Wait for their test result. Do not mark phone install verified based on CI alone.
3. Confirm publication commit/version and targets before launching the stable release. Let the guarded workflow publish npm platform packages then launcher then GitHub release, if supported by the final workflow. Monitor the exact runs; check published npm versions and installation of the launcher, GitHub assets/checksums, and signed APK release link. Check registry state before repeating any partial publish.

## Definition Of Done
Supported release jobs pass, Android install/launch is confirmed by the owner, npm packages and GitHub assets are verified, and any unsupported target or remaining limitation is explicit. Do not promise builds that the final workflow does not support.

## Expected Artifacts
Exact GitHub Actions run links, tested Android APK link, owner test results, GitHub release link, npm package/version and smoke check evidence.

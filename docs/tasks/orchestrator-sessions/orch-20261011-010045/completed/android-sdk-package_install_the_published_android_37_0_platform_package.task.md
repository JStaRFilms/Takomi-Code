# Install the published Android 37.0 platform package

## Objective
Fix the second confirmed CI setup failure in38117135406: sdkmanager cannot find platforms;android-37. Google repository2-3.xml publishes platforms;android-37.0 at stablechannel0, api-level37.0/baseextension22, but no platforms;android-37. Buildtools37.0.0 and NDK27.1.12297006 are available. Do not downgrade the actual React Native compile SDK37 or change dependencies.

## Prime context
Read AGENTS, scripts/build-android-artifact.ts (ANDROID_TOOLCHAIN, gradleArgs, updatesArgs, catalog validation) and tests, .github/workflows/takomi-release.yml sdkmanager command and scripts/takomi-release.test.ts. Inspect current local RN/Expo Gradle source read-only only if needed to verify major/full SDK mapping. Fetch only public SDK metadata, never credentials.

## Scope
Keep compileSdk37,target36,buildtools37.0.0,NDK27.1,Gradle9.4.1 andAGP9.2.1 checks intact. Separate published SDK package version37.0 from RN's compile API37 where necessary. Have workflow install exact stablepublished identifier via sharedtoolchain constant. Preserve Android setup explicit platform-tools fix and silentlicenseacceptance. Do not invent symlink/rename platform workarounds or downgradeAPI36 to hide failure.

## Completion criteria
SDK package path matches actual publicstablemetadata. Focused tests cover package/full-version vs compileSDK relationship and workflowconsumption; existing41focusedtests pass, scoped scripts typecheck/lintformat. If AGP/Expo mappingneedsadditionalchange, confirmfromsource before touchingit. No APKclaimuntilactualCIcompile succeeds.

## Expected artifacts
Minimal helper/workflow/focusedtests diff, source-grounded explanation, checkresults. Parentreviewscommit/push/build-onlydispatch onlyaftercorrectsource; no agent commits/push or dispatches.

## Constraints
Vaultcoder alreadyterminalblocked/nofileschanged, so onlythissourcewritingagent. Vaultprivate-bridge requires approval andis outofscope. MobileolderclientSend failureunderinvestigation, untouched. No secrets/signingstate/npmrc/envreads, realVaultretry/browser/device/server, otherworktrees/liveinstallwrites, releases/tags/npm publication. ExistingfailedCI38117135406cancelledremainingjobs andmonitorpaused; parentreenablesmonitorfornextbuild.

# M02: Merge reviewed parity work and prepare local test builds

## Objective

User explicitly requested merge-back to the Pi parity branch and new Windows/Android apps for testing after B09b completion. Source is da3a3574f45001e0d9260f4d585ebcc63f1d1d0a on feat/pi-parity-next. Confirmed target is C:/CreativeOS/01_Projects/Code/Clones/2026-07-22_t3code, feat/pi-takomi-parity at0720935fda86295cd76d428535dbbcee5e3cb2de, cleanindex/trackedtree. Recheck before every mutation.

## Scope and safety

Finish the reviewed64path B09b commit, create a backup of the exact target, then fast-forward only if ancestry and cleanliness remain confirmed. No stash/reset/discard or force merge. Stop if target ownership changed. Never merge or alter dormant feat/pi-debrand. Do not start servers against realdata, migrate accounts, deploy, push, publish, installapps orkillexistingprocesses.

Read current AGENTS, release/README.md and full local-build/build-desktop-artifact scripts. User authorized localbuilds, not releasepublication. Windows uses documented local desktop packaging; Android uses standalone arm64 debug-signedpreview withmanagedshort-path staging, noMetro. Verify script-owned scratch/markers, existingartifact targets, dependency/toolchain availability and any required externalpath/install permissions before execution. Preserve originalcheckouts and live ~/.t3data.

## Deliverables and done

Merged target preserves exact reviewedsource content and cleantracked/index state. Record backup/ref/ancestry and resultingHEAD. Follow with separate W02/A02-build packets for exact build commands/prerequisites/artifactpaths/logs. Builds mustproduce actualcurrent-source artifacts and metadata/hash/size beforeclaiming success. Installed/native/livefunctionaltesting remainsuser's nextstep, not provenbyunit tests orpackaging.

Plans and reports stay in this isolatedsessionuncommitted. Parent owns integration and tracks61-63. Sequentialartifact work avoids competingwriters/sharedbuildoutputs. No blanketnewdependency/globalinstallpermission, and managedstaging destructivecleanup requires confirmedownership/target.

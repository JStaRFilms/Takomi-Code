# A09: Ground native queue controls in actual APIs

## Setup

Read-only architect in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next. Baseline456ce9fcc644b027a62d2d49a12fcd0775488116. Read AGENTS.md, unslop, Effect reference, G03/D01, B02/B05-B08b acceptance and A08.plan.md including its correction. User chose Queue controls first. Manual compaction remains blocked; no native runtime change is authorized. Existing UI reuse remains the default, with small missing feature controls using current components.

## Objective and source

Define one or more narrow B09 queue slices from actual native0.99.1 public RPC and source, not the stale33-operation ledger. Read complete relevant RPC/queue/session/extension docs and exact native handlers for prompt/steer/follow_up/get_state/set_steering_mode/set_follow_up_mode/clear operations where present. Reference root C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent. No native execution.0.84.4method fixture is not semanticproof.

Trace PiAdapter sendTurn/pendingRPC/inputOutcome/independentagent_start/turncompletion; ProviderService/ProviderCommandReactor/ingestion; current wire contracts and client sharedqueue/commands. Trace web ChatView/ChatComposer/composerDraftStore/nativeThreadComposer/draft outbox/commandmenus/settings/palette/keybindings. Enumerate current T3 queue versus native queue authority and existingUIentrypoints before proposing new controls.

## Required decisions

Distinguish GUIqueued drafts from native accepted steering/follow-up messages. A native queued acknowledgment is not a model turn and must not lose or reclassify independent native work. Preserve originatingturn correlation, laternative starts and B02 handled/failed input semantics. Separate foreground/steer/followup intents and actual modeall/one-at-a-time values. Do not silently reinterpret existingqueued drafts or mutate attachments/device drafts.

Identify what native get_state actually exposes: queuecounts/modes versus actual text/IDs. Never label a locallytrackedlist asauthoritativeCLI/extension-ownednativequeue. If clear/restore has no exactpublic nativeAPI, recordlimitation anddefer ratherthan inventcommand, emulatewith broadabort/restart, oradd a runtimepatch. Any native operation thatcan abortindependentwork needs atomicownership orseparateapproval, as A08 showed. Mode changes requireauthmutation/currentexactowner andtruthfulreadback, notmodelchosentools orfutureSettingsselection.

Usecaptured actualbinding/context/process/version/transport/source authority from B05/B08b. Rejectstaleowner/lateoutcomes androuteallclients owningenvironment. B08b stats bookkeepingprivacy fix mustremain: statsIDs intercept BEFOREsetter/log/genericdispatch. Queuestate/controls shouldnot logprivatequeuedtext orturnnativeprivateinputintodurableactivity. Keep existingstream bounds/coalescing; noqueuepolling/historyjournal unlessactualnativeeventsemanticsrequireexplainableon-demandrefresh.

Recommendminimaltyped read/mutationhandlers onlyfortherequired nativeoperations, notgenericRPCgateway. Reuse currentT3composer send/queue/mode components whereaccurate. Ifsmallnewtoggle/detailscontrol needed specifyexistingprimitives. EnsureSettings/palette/keybinding reachablepathscoveredonlywhererelevant,notduplicatecontrolsforlook.

## Deliverable and limits

Returninline plan with exactsource/APIevidenceandboundeddependencyordered B09a/B09b/etc scopes, handler/DTO/lifecycle/state/UI choices, actualsemanticversiongates, meaningfultests andpermissions/blockers. Choose thefirst safe implementation slice andkeepothergaps recorded. ParentpersistsA09.plan.md andauthorsmeaningfultaskpacket beforewriterlaunch.

READONLY no writes/tests/nativeexecution/realCLI/session/auth/credentials/install/prepare/build/server/browser/live/canonical/global/gitmutation/subdelegate. Don'tresetGenesis orcountoldchecksasintegratedproof. No compaction/retry/bash/sessiontree/auth/runtime-delivery scope in queues. No speculative architecture or applyinganotherprovider's semantics toPi.

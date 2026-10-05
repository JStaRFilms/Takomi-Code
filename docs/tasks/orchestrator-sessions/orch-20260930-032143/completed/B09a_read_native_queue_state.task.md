# B09a: Read truthful native queue counts and modes

## Setup

Sole synchronous coder in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next, baseline456ce9fcc644b027a62d2d49a12fcd0775488116. Read AGENTS.md, unslop, Effect reference, A09.plan.md, A08 correction, D01, B02/B05-B08b acceptance and actual code/tests. User chose queue controls before runtime changes and wants existing UI reuse. Session docs stay uncommitted. No native board in another checkout.

## Objective and scope

This first queue slice adds authenticated read-only native pending count and delivery-mode details across web/desktop/mobile. It establishes truthful state before later input, text-list and clear/recovery actions. Do not change sends, Stop, local queued drafts/outbox schemas, native modes/settings or compaction. Native mode setters persist global agent settings and require separate target permission. Native compact remains blocked by A08's abort race.

## Native source and contract

Read complete relevant0.99.1 RPC docs/types/handlers and nativequeue implementation under C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent. Native get_state provides combinedpendingMessageCount,steeringMode/followUpMode all|one-at-a-time,isStreaming,isCompacting. It does NOT provide per-kindcounts/text/itemIDs. queue_update events contain fullordered private text arrays. clear_queue is supported, but not part of this slice; no per-itemedit/atomicrestoreAPI. Don'tguessfromolderfixture/ledger orusecatalogcompatibilityasqueueproof.

Typed unary provider.getPiQueueState. InputthreadId,expectedProviderInstanceId,expectedGeneration from actualB05leasedprocess. OutputthreadId,owninginstance,generation,fetchedAt,sourcepi-native,combinednonnegativesafeintegerpendingMessageCount,validsteering/followup modes,booleanstreaming/compactionflags. No model/path/sessionID/privatequeuedtext orrawrecords. Validate requiredfields; unknown/missing fails ratherthaninventzero. Gate optional queue-read support exactly0.99.1 usingB08b capturedactuallaunchversion andcurrentnativeowner. No newprobe, recovery orprocessstart forread.

## Backend privacy and ownership

UseB08btypedreadRPC/authorchestrationread/existing-threadchecks/serviceallowRecoveryfalse/exactregistrywrapperbindingcontextprocessliveness/opaquegeneration fences before/afterawait. Expectedgenerationmustmatchatintentandreturn. BoundedsafeRPCerrors,noprivaterawdetails. Addoptionaladapterread/servicehandleronlyforthisspecificoperation,noarbitrarygateway.

PreserveB08bstatsIDinterception BEFOREALLsetter/log/genericdispatch. Adduniquelynamespacedqueue-stateget_stateIDinterception immediatelyafterstats. Anyqueue-read-identifiable record,regardlessclaimedtype,mustvalidatethependingresponseorfailgenerically; late/interruptedframes discarded,noprivate logging/UI/turneffects orrequestIDhistory.

Discardrawqueue_update BEFORElogging/setter/genericnormalization inthisslice. Eventsotherwiseleakqueuedtextintocanonicalhistory. No durablewarning containingrecord. Do notclaimnativequeuecontentsknownfromcounts ortrackfakeIDs. KeepJSONL1MiBceiling andB05/B07setter/directpublication unchanged.

## Clients and existing UI

ReuseB08brequest-drivenstatepattern withoutspeculativegeneralization. FocusedsharedpiQueueState.ts keyedactualenvironment/thread/owner/generation/transport, web/mobilebindingsanddetailscomponentsusingcurrentDialog/Button/nativeSheetpatterns. Fetchonopen,explicitRefresh,reconnectonlywhileopen; coalescependingreads,close/blur/disposalcancel; sourceequalitypreventsunrelatedupdates/newfetches. Staleresultscannotretargetreplacementowner. No polling/backgroundscan/history.

Usecurrentwebcomposeractions/palette,desktopweb,existingnativecomposer/headeractions andThreadDetailScreenindependentsheet. Actualpathsexactsource first,avoidduplicatestats+queue dashboard ornewvisualsystem. ShowNativequeuedmessagesdistinctfromlocalwaitingdrafts. Countiscombined,two modesread-only,no fabricatedper-kindcounts orlists. Current/unavailable/loading/stale/error/refresh/close semantics, nativeblur/unmount cleanup anddevice/environmentfencing. No drafttext/attachments/outbox mutation andno modeconfigurationUIuntilpermission.

## Source targets and tests

Contractsprovider.ts/rpc.ts/server.ts;provideradapter/serviceinterfacesandLayersProviderService/PiAdapter/PiProvider;RpcAuthorization/ws;focusedsharedstateandpackageexport;web/nativebindings/details/components/palette/composer/header/detailroute asnecessary. Reuseexistingfixturegraphs,routing/primitives ratherthannewlayers.

Meaningfultests fornativecombinedstate/modes/schema/version/expectedgeneration,wrong/stopped/replaced/deleted owners/norecovery,authreaddenyoperates,privatefields/IDs/malformedtype/late/interruptedread BEFORElogs/events/setters,queue_update suppression,statsIDguardregression,genuinesubsequentinput/events,B05publication. SharedrealRPCtests open/refresh/coalescing/equality/transportsource/env/navigation/disposal, nativeblur,truthfulreadonlyUI andunchangedlocaldrafts/outboxes. Controlledpeer/Deferred/drain tests,no sleeps/polling/relaxeddeadlines. Existing0.84fixtureversiononlybehavior stays.

Runfocusedtests/affectedtypes/ownedlintfmt/diff only. Attributeinheritedwarnings exactly,no suppression/blanketB05exception. Stopforexpandedunrelatedrisk/scope. Updateconciseexistingfeatureguidewhereusagechanges. Writeexactsession-rootB09a.report.md withownedpaths/authority/privacy/version/state/UIdecisions/commands/counts/limits,return syncforonefocusedreview,samewritercorrections,ownedcommit. No stage/commit/subdelegate/install/prepare/build/server/Metro/browser/computer/native/realCLI/session/auth/live/canonical/global/push/PR/fullsuite. Hermeticfixturesallowed. Installedclients/remote/twodevice/fullqueuecontrols/fullparitynotclaimed.

## Writer handoff

Implementation is ready for one focused parent review. See session-root `B09a.report.md` for the exact 33 owned source/test/package/doc paths, ownership and privacy decisions, current verification and limits. No staging or commit. Confirmed review corrections remain with this writer.

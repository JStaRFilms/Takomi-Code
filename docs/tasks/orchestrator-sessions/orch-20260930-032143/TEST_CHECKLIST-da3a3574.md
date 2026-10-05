# Windows and Android comparison checklist

## Builds

Both artifacts use commit da3a3574f45001e0d9260f4d585ebcc63f1d1d0a on feat/pi-takomi-parity.

Directory: C:/CreativeOS/01_Projects/Code/Clones/2026-07-22_t3code/release/

- Windows: Takomi-Code-0.0.44-x64.exe,136502344bytes. SHA2560bef6234f7c61e6e53602d57d2cd2b8cd2812d9de9da6c40fa0de87ddc355291.
- Android: Takomi-Code-Preview-1.3.1-da3a3574.apk,92297099bytes. SHA2566e5539c052f85f5db9d3b240562db0c94879649649e04ccdd074993a6096d491.

Parent independently hashed both outputs. Windows packaging validation and Android package/arm64/debug-signature checks passed. Neither app was installed or opened by the agent.

## Setup

Before installing the new Windows build, note how the old installed app behaves. Versions are reused for these local test builds, so version number alone does not identify new code. The APK filename contains its source SHA.

Use a disposable project/thread and non-sensitive sample text/images/files. Start the new Windows app and connect Android to that same new server. An old server will not provide the new RPCs. Explicit native input/stats semantics are supported for Pi0.99.1. An older runtime being reported unsupported is a version limitation, not evidence of successful parity. Do not change the canonical suite's pinned runtime automatically.

The Windows installer is unsigned. Android is a standalone arm64 debug-signed preview using com.t3tools.t3code.preview, not a Play Store build; no Metro is required. An existing preview with different signing may conflict. Do not delete app data merely to get a test passing.

## Run these on both apps

| #   | Test                                                                                                                         | Expected difference or safety check                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Send ordinary text, an image and a small file through ordinary Send.                                                         | Existing behavior still works. No duplicate messages, missing attachments or unexpected native queueing.                                                                                                                                                                        |
| 2   | While Pi is working, submit a short explicit steering input.                                                                 | It uses native steering, separate from local waiting drafts. A labeled authored-submission entry shows its actual outcome. No fake assistant/tool/model turn appears just because it was accepted.                                                                              |
| 3   | Submit a native follow-up while work is running, then once while idle.                                                       | Native follow-up is distinct from the local queue. queued means accepted, not consumed. An idle native queue does not promise to start a run.                                                                                                                                   |
| 4   | Repeat native input with an image, a small file and available composer context.                                              | All selected content is kept and prepared. Preview/history retains authored text and attachment references. Images/files are not silently dropped.                                                                                                                              |
| 5   | Submit, then immediately edit the text, add/remove an attachment, or send an ordinary message while confirmation is pending. | The accepted original snapshot can clear only if unchanged. Newer text/context/attachments stay. Ordinary Send is not falsely acknowledged by a native-input row.                                                                                                               |
| 6   | Submit, navigate away and back, or disconnect/reconnect.                                                                     | No automatic resend or outbox replay. Newer/wrong-thread drafts are not cleared. Unknown/unconfirmed keeps recoverable input. If confirmation never arrives, local controls eventually release without pretending it failed or retrying.                                        |
| 7   | Open native queue details and Refresh during/after work.                                                                     | Combined native pending count and read-only modes are shown separately from local waiting drafts. Counts can drop quickly when consumed. No native queued-text list or mode mutation is promised.                                                                               |
| 8   | Open session statistics and Refresh after more ordinary work.                                                                | Native cumulative counts/tokens/cost stay distinct from current context and account quota. Missing estimates are unavailable, not invented zero.                                                                                                                                |
| 9   | Restart/reopen the thread and load older history.                                                                            | Typed input records keep their current outcome and position. Unconfirmed records do not replay or turn into endless model spinners.                                                                                                                                             |
| 10  | Switch the future model selection while the current Pi session still owns the thread, then end/replace the actual session.   | Details track the actual owner, not merely the next selected model. Ended/replaced/disconnected data is stale or unavailable, not current.                                                                                                                                      |
| 11  | When an extension produces status/widget/subtitle/editor suggestions, exercise them.                                         | Plaintext widgets/status appear in existing locations. Replace/Insert/Dismiss requires explicit action. Changed drafts require fresh confirmation. Nothing auto-sends, drops attachments or renames the user's thread title. Mark this unexercised if no extension produces it. |
| 12  | Stop ordinary work and use existing local waiting queues.                                                                    | Existing Stop/local queue behavior remains separate from explicit native inputs. Do not interpret Stop as the still-unimplemented clear-native-queues action.                                                                                                                   |

## Platform-specific checks

Windows: resize the window, check composer focus/selection after submission, attachment previews and existing palette/keybindings. Use a remote Android connection to the new Windows server rather than accidentally testing a previous server process.

Android: cold-open without Metro, connect/reconnect, hide/reopen the keyboard, edit selection while awaiting confirmation, use the image/file picker, scroll the typed history rows and reopen details with the composer hidden. Background and foreground the app. Watch for stuck controls, wrong-thread clears or duplicated submissions.

Two-device check: keep different drafts on Windows and Android in the same thread. Submit native input from one device. Its outcome may appear on both, but the other device's draft must not clear or send.

## Optional sequential CLI check

Use only a disposable original native session. Release its GUI process, resume the same original file in CLI, send one harmless input, exit CLI, then continue it from GUI. Never allow concurrent independent CLI/GUI writers. Check for duplication or missing history. Stop and report divergence rather than resetting the native file. This remains exploratory interoperability proof, not something packaging verifies. Mobile catalog/tree continuation is not claimed complete.

## Not implemented by this slice

Ordered private native queue contents, clear/held recovery, global mode writes, safe manual Pi compaction, rich extension dialogs, complete Takomi control readback and full session-tree/consumed-input fidelity remain separate. The debrand branch was not merged. Do not report those known omissions as regressions introduced by this feature.

## What to send back

For a failure, send platform, test number, native runtime version, exact steps, expected versus actual result and a screenshot/short clip. Redact tokens, account information, private file contents and pairing links. Say whether Android was connected to the newly built Windows server. Keep rejected/unknown input until you understand its outcome; resubmission may duplicate native work.

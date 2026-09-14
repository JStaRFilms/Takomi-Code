# Continuing a CLI session in T3 Code

This flow is available in the web and desktop clients. The mobile client does
not yet expose session discovery or continuation.

If you started work in a terminal with `pi` (Takomi), you can continue the same
session in T3 Code — and hand it back to the terminal later.

## Continue a session

1. Open the command palette and run **Continue CLI session**.
2. Pick a session from the list for the current project.
3. Choose **Continue** to keep writing the same session file, or **Fork** to
   clone it first so the app and the terminal diverge cleanly.
4. To split from an earlier point, expand a session's messages and choose
   **Fork from here** on any message — the fork keeps everything through that
   message so a second agent can take a different direction. Forking from one
   of your own messages keeps everything _before_ it and puts your text back
   in the composer, unsent, so you can edit and resend — just like branching
   in the terminal.

The new thread starts with the model's full CLI context, and the earlier CLI conversation
(user and assistant messages) is shown as thread history. Tool calls from the CLI stay
context-only and are not shown as messages.

## Hand it back to the terminal

While a continued thread holds the live session file, leave that file alone in
other terminals. When you want to work in the terminal:

1. Open the thread's menu (sidebar right-click or chat header) and choose
   **Release Pi session to CLI**.
2. Work in the terminal.
3. Send your next message in the thread — it re-attaches automatically and
   picks up what the CLI added.

## Sync new CLI messages into the open thread

If the session file moves forward while the thread is open (you worked in the
terminal without releasing, or another process appended), a banner appears
above the composer: **N new CLI messages**, with a **Sync** action. Syncing
appends the new messages to the thread's visible history — the same thread,
nothing abandoned. The banner reappears on its own when more work lands, and
dismissing it only silences that batch.

Requires a Pi release T3 Code supports (0.84.4 or 0.85.1) and a project whose
Takomi provider is enabled.

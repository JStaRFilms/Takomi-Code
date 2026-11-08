# Continuing a CLI session in Takomi Code

This flow is available in the web and desktop clients. The mobile client does
not yet expose session discovery or continuation.

If you started work in a terminal with `pi` (Takomi), you can continue the same
session in Takomi Code, or fork it to keep the app and terminal independent.

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
other terminals. The V2 client does not currently expose **Release Pi session to CLI**.
To use that same file in a terminal, stop the owning environment and wait for its Pi
processes to exit first. Restart the environment when terminal work is finished;
the next message resumes the bound file. Prefer **Fork** when you need both sides
available independently.

## Sync new CLI messages into the open thread

If the session file moves forward while the thread is open (you worked in the
terminal while the environment was stopped, or another process appended), a banner appears
above the composer: **N new CLI messages**, with a **Sync** action. Syncing
appends the new messages to the thread's visible history — the same thread,
nothing abandoned. The banner reappears on its own when more work lands, and
dismissing it only silences that batch.

Requires an enabled Takomi provider and a compatible Pi v3 session file. New Pi package releases
do not require an app update unless they change the session storage format or directory layout.

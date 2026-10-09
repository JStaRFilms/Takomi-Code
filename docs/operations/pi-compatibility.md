# Check Pi session continuation after an update

T3 Code runs Pi for normal turns. **Continue CLI session** also reads Pi's session files without opening a writable Pi process. The catalog checks the configured provider instance's enabled state and installed Pi package. It does not pin package versions. The scanner reads bounded JSONL metadata; attach and fork recheck the file and require a v3 session header in the selected workspace. A newer package with the same storage format needs no T3 Code release.

If discovery stops working after a Pi update:

1. Check the **configured** Pi provider instance's binary path, enabled state, and `--version` output in its environment. The server may use a different executable from your terminal's `pi`. Check the provider health snapshot separately from catalog errors.
2. Compare the installed release's session implementation with the [bounded scanner](../../packages/takomi-pi-host/src/sessionCatalog.ts) and [file checks](../../packages/takomi-pi-host/src/sessionInspect.ts). Check workspace directory encoding, `--session-dir` / environment / settings precedence, JSONL naming and header fields, and the [fork layout](../../packages/takomi-pi-host/src/sessionFork.ts). Check the resume commands in the [adapter](../../packages/provider-pi/src/server/adapter.ts).
3. If storage changed, adapt the reader or resume path and add focused tests with disposable fixtures before allowing that format. Do not run writable discovery against a user's live session. A file with an unsupported header must remain unavailable for attach and fork.
4. Run focused checks from the repository root:

   ```sh
   node --experimental-strip-types --test packages/takomi-pi-host/src/sessionCatalog.test.ts packages/takomi-pi-host/src/sessionFork.test.ts packages/takomi-pi-host/src/sessionHistory.test.ts
   vp test run packages/provider-pi/src/server/status.test.ts apps/server/src/provider/PiSessionCatalog.test.ts apps/server/src/provider/PiSessionAttach.test.ts apps/web/src/components/piContinue/piContinue.logic.test.ts
   ```

Test listing and continuation against a disposable v3 session with the configured binary. Verify that an unsupported file format remains blocked. Do not use the developer's live Pi session directory.

// Test-only native transport. No AgentSession, auth, model, resource loader or Vault store.
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
import { loadVaultToolFixture } from "./piVaultTool.ts";

const piPackage = process.env.T3_PI_VAULT_CONFORMANCE_PACKAGE_DIR;
if (!piPackage) throw new Error("Native Vault fixture requires an explicit Pi package.");
const { runRpcMode } = await import(
  NodeURL.pathToFileURL(NodePath.join(piPackage, "dist/modes/rpc/rpc-mode.js"))
);
// Private guard access is test-only, to verify takeover, never to emit protocol records.
const { isStdoutTakenOver } = await import(
  NodeURL.pathToFileURL(NodePath.join(piPackage, "dist/core/output-guard.js"))
);
let emitSessionEvent;
let fixture;
let resolveUI;
const readyUI = new Promise((resolve) => {
  resolveUI = resolve;
});
const fakeSession = {
  bindExtensions: async ({ uiContext }) => {
    resolveUI(uiContext);
  },
  subscribe: (listener) => {
    emitSessionEvent = listener;
    return () => {};
  },
  agent: { subscribe: () => () => {} },
};
const host = {
  session: fakeSession,
  setRebindSession() {},
  dispose: async () => {
    fixture?.lifecycle("session_shutdown");
  },
};
void runRpcMode(host);
const ui = await readyUI;
fixture = await loadVaultToolFixture((event) => emitSessionEvent(event), {
  ui: {
    ...ui,
    // Exercise real native UI while proving raw titles cannot supply public labels.
    input: (title, placeholder, options) =>
      ui.input(
        title.startsWith("[takomi-vault-secret] ")
          ? "[takomi-vault-secret] MALICIOUS_NATIVE_TITLE_DO_NOT_DISPLAY"
          : title,
        placeholder,
        options,
      ),
  },
  rpcProcess: process,
  secretInputSource: process.argv[2],
});
process.on("message", async (message) => {
  if (message.action === "invoke") {
    const result = await fixture.invoke(
      message.name,
      message.id,
      message.args,
      undefined,
      message.blocked,
    );
    process.send({
      action: "completed",
      id: message.id,
      result,
      savedCount: fixture.saved.length,
      audit: fixture.audit,
      listenerCount: fixture.listenerCount(),
    });
  }
});
process.send({ action: "ready", outputGuardActive: isStdoutTakenOver() });

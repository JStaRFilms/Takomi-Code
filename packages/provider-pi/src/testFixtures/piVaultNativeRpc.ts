// @effect-diagnostics nodeBuiltinImport:off -- Isolated fake-host child, never a live Pi session.
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
import type { PiRpcRecord } from "../server/rpc.ts";

/** Real OS pipes and installed runRpcMode. Only the host and persistence are fake. */
export async function loadNativeVaultRpcFixture(
  emit: (record: PiRpcRecord) => void,
  options: { ownershipNotify?: string; secretInputSource?: string | undefined } = {},
) {
  const child = NodeChildProcess.fork(
    NodeURL.fileURLToPath(new URL("./piVaultNativeRpc.mjs", import.meta.url)),
    options.secretInputSource ? [options.secretInputSource] : [],
    {
      execArgv: ["--disable-warning=ExperimentalWarning"],
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      // No inherited auth/provider configuration is needed by this pure fixture.
      env: {
        T3_PI_VAULT_CONFORMANCE_EXTENSION_DIR: process.env.T3_PI_VAULT_CONFORMANCE_EXTENSION_DIR,
        T3_PI_VAULT_CONFORMANCE_PACKAGE_DIR: process.env.T3_PI_VAULT_CONFORMANCE_PACKAGE_DIR,
        T3_TAKOMI_VAULT_SECRET_UI: "1",
        T3_TAKOMI_VAULT_OWNERSHIP_NOTIFY: options.ownershipNotify ?? "1",
      },
    },
  );
  const input = child.stdin;
  const output = child.stdout;
  const diagnostic = child.stderr;
  if (!input || !output || !diagnostic) throw new Error("Missing native fixture pipes.");
  const records: PiRpcRecord[] = [];
  const stderr: string[] = [];
  const inputs: PiRpcRecord[] = [];
  const inputWaiters: Array<(record: PiRpcRecord) => void> = [];
  const pending = new Map<
    string,
    { resolve: (record: PiRpcRecord) => void; reject: (error: Error) => void }
  >();
  let readyResolve: (record: PiRpcRecord) => void = () => {};
  let readyReject: (error: Error) => void = () => {};
  const ready = new Promise<PiRpcRecord>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const fail = (error: Error) => {
    readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      fail(error);
      reject(error);
    });
    child.on("close", (code) => {
      fail(new Error(`Native fixture exited: ${code}`));
      if (code === 0) resolve();
      else reject(new Error(`Native fixture failed: ${code}`));
    });
  });
  // Observe startup failure without an unhandled rejection before close().
  void exited.catch(() => {});
  child.on("message", (message: unknown) => {
    if (message === null || typeof message !== "object" || Array.isArray(message)) return;
    const record = Object.fromEntries(Object.entries(message));
    if (record["action"] === "ready") readyResolve(record);
    else if (record["action"] === "completed" && typeof record["id"] === "string") {
      pending.get(record["id"])?.resolve(record);
      pending.delete(record["id"]);
    }
  });
  const answer = (id: string, value: string | undefined) =>
    input.write(
      `${JSON.stringify({ type: "extension_ui_response", id, value, ...(value === undefined ? { cancelled: true } : {}) })}\n`,
    );
  let buffer = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const record: PiRpcRecord = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      records.push(record);
      if (record["method"] === "input") {
        const waiter = inputWaiters.shift();
        if (waiter) waiter(record);
        else inputs.push(record);
      }
      // Approvals use the real native dialog/response path with synthetic first choices.
      if (record["method"] === "select" && Array.isArray(record["options"])) {
        answer(String(record["id"]), String(record["options"][0]));
      } else emit(record);
    }
  });
  diagnostic.setEncoding("utf8");
  diagnostic.on("data", (chunk: string) => stderr.push(chunk));
  try {
    const state = await ready;
    if (state["outputGuardActive"] !== true) throw new Error("Native output guard not active.");
  } catch (error) {
    input.end();
    await exited.catch(() => {});
    throw error;
  }
  return {
    records,
    stderr,
    answer,
    nextInput() {
      const queued = inputs.shift();
      return queued
        ? Promise.resolve(queued)
        : new Promise<PiRpcRecord>((resolve) => inputWaiters.push(resolve));
    },
    invoke(name: string, id: string, args: unknown, blocked = false) {
      return new Promise<PiRpcRecord>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.send({ action: "invoke", name, id, args, blocked });
      });
    },
    async close() {
      input.end();
      await exited;
    },
  };
}

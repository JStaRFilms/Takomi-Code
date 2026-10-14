// @effect-diagnostics nodeBuiltinImport:off -- Loads only approved code files and Pi's pure validator, never a session or credential store.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeVM from "node:vm";

type RecordValue = Record<string, unknown>;
interface FixtureTool {
  name: string;
  parameters: unknown;
  execute(
    id: string,
    params: unknown,
    signal: AbortSignal | undefined,
    update: undefined,
    ctx: unknown,
  ): Promise<unknown>;
}

interface FixtureUI {
  input(
    title: string,
    placeholder?: string,
    opts?: { signal?: AbortSignal },
  ): Promise<string | undefined>;
  select(title: string, choices: string[]): Promise<string | undefined>;
  notify(message: string, type?: string): void;
}

/** Explicit opt-in. All installed persistence imports are replaced before code executes. */
export async function loadVaultToolFixture(
  emit: (record: RecordValue) => void,
  options: {
    ui?: FixtureUI;
    rpcProcess?: NodeJS.Process;
    ownershipNotify?: string;
    secretInputSource?: string;
  } = {},
) {
  const directory = process.env.T3_PI_VAULT_CONFORMANCE_EXTENSION_DIR;
  const piPackage = process.env.T3_PI_VAULT_CONFORMANCE_PACKAGE_DIR;
  if (!directory || !piPackage)
    throw new Error("Vault conformance requires explicit code/package paths.");
  const requireInstalled = NodeModule.createRequire(NodePath.join(piPackage, "package.json"));
  const typebox: unknown = requireInstalled("typebox");
  const validation: unknown = await import(
    /* @vite-ignore */ NodeURL.pathToFileURL(
      NodePath.join(piPackage, "node_modules/@earendil-works/pi-ai/dist/utils/validation.js"),
    ).href
  );
  const validate =
    validation !== null && typeof validation === "object"
      ? Reflect.get(validation, "validateToolArguments")
      : undefined;
  if (typeof validate !== "function") throw new Error("Missing native Pi argument validator.");
  const tools = new Map<string, FixtureTool>();
  const handlers = new Map<string, Set<() => void>>();
  const dialogs = new Map<string, (value: string | undefined) => void>();
  const records: RecordValue[] = [];
  const audit: unknown[] = [];
  const saved: unknown[] = [];
  let nextDialog = 0;
  let nextCorrelation = 0;
  let sessionId = "00000000-0000-4000-8000-000000000002";
  const output = (record: RecordValue) => {
    records.push(record);
    emit(record);
  };
  const failPersistence = new Proxy(
    {},
    {
      get: (_target, key) => () => {
        throw new Error(`Unexpected persistence call: ${String(key)}`);
      },
    },
  );
  const mocks = new Map<string, unknown>([
    ["typebox", typebox],
    ["node:fs", failPersistence],
    ["node:path", failPersistence],
    ["@earendil-works/pi-tui", failPersistence],
    ["./adapters.ts", failPersistence],
    ["./crypto-store.ts", failPersistence],
    ["./audit.ts", { logAudit: (value: unknown) => audit.push(value) }],
    [
      "./vault-store.ts",
      {
        findByService: () => [],
        createCredential: (value: unknown) => {
          saved.push(value);
          if (value === null || typeof value !== "object")
            throw new Error("Invalid synthetic credential");
          return { ...value, id: "cred_SYNTHETIC", label: "Synthetic" };
        },
        isEphemeral: (value: { createdBy?: string }) => value.createdBy === "agent-once",
        deleteIfEphemeral: () => true,
      },
    ],
    [
      "./grant-store.ts",
      {
        revokeExpiredSessionGrants() {},
        revokeGrants() {},
        issueGrant: (input: {
          credentialId: string;
          target: string;
          tool?: string;
          operation?: string;
          fields?: string[];
          scope: string;
        }) => ({
          ...input,
          grantId: "grant_SYNTHETIC",
          target: input.target.trim().toLowerCase(),
          tool: input.tool ?? "terminal",
          operation: input.operation ?? "use",
          expiresAt: 0,
          useCount: 0,
        }),
      },
    ],
  ]);
  const load = (file: string) => {
    const source = NodeFS.readFileSync(
      file === "secret-input.ts" && options.secretInputSource
        ? options.secretInputSource
        : NodePath.join(directory, file),
      "utf8",
    );
    const module = { exports: {} };
    const code = NodeModule.stripTypeScriptTypes(source)
      .replace(/import \{([^}]+)\} from "([^"]+)";/g, 'const {$1} = require("$2");')
      .replace(/export (async )?function /g, "$1function ")
      .replace(/export class /g, "class ");
    const exports =
      file === "tools.ts"
        ? "registerVaultTools"
        : file === "types.ts"
          ? source.includes("export class VaultOperationError")
            ? "VaultOperationError"
            : ""
          : "maskedSecret, supportsSecretEntry, vaultSecretInvocation";
    NodeVM.runInNewContext(
      `${code}\nmodule.exports = { ${exports} };`,
      {
        module,
        exports: module.exports,
        require: (name: string) => {
          if (name === "node:crypto")
            return {
              randomUUID: () =>
                `00000000-0000-4000-8000-${String(++nextCorrelation).padStart(12, "0")}`,
            };
          if (!mocks.has(name)) throw new Error(`Unmocked installed import: ${name}`);
          return mocks.get(name);
        },
        AbortController,
        Date,
        Set,
        Map,
        process: options.rpcProcess ?? {
          env: {
            T3_TAKOMI_VAULT_SECRET_UI: "1",
            T3_TAKOMI_VAULT_OWNERSHIP_NOTIFY: options.ownershipNotify ?? "1",
          },
          stdout: {
            write() {
              throw new Error("Ownership must use native UI notifications, not stdout.");
            },
          },
        },
      },
      { filename: file },
    );
    return module.exports;
  };
  mocks.set("./types.ts", load("types.ts"));
  mocks.set("./secret-input.ts", load("secret-input.ts"));
  const exports = load("tools.ts");
  const register = Reflect.get(exports, "registerVaultTools");
  if (typeof register !== "function") throw new Error("Missing registered Vault tools.");
  Reflect.apply(register, undefined, [
    {
      registerTool: (tool: FixtureTool) => tools.set(tool.name, tool),
      on: (event: string, handler: () => void) => {
        const set = handlers.get(event) ?? new Set();
        handlers.set(event, set);
        set.add(handler);
        return () => set.delete(handler);
      },
    },
  ]);
  const ctx = {
    hasUI: true,
    mode: "rpc",
    sessionManager: { getSessionId: () => sessionId },
    ui: options.ui ?? {
      notify: (message: string, notifyType?: string) =>
        output({
          type: "extension_ui_request",
          id: `notify-${nextCorrelation}`,
          method: "notify",
          message,
          notifyType,
        }),
      input: (title: string, placeholder: string | undefined, opts?: { signal?: AbortSignal }) => {
        const id = `native-dialog-${++nextDialog}`;
        return new Promise<string | undefined>((resolve) => {
          const abort = () => finish(undefined);
          const finish = (value: string | undefined) => {
            dialogs.delete(id);
            opts?.signal?.removeEventListener("abort", abort);
            resolve(value);
          };
          dialogs.set(id, finish);
          opts?.signal?.addEventListener("abort", abort, { once: true });
          output({ type: "extension_ui_request", id, method: "input", title, placeholder });
          if (opts?.signal?.aborted) finish(undefined);
        });
      },
      select: async (_title: string, choices: string[]) => choices[0],
    },
  };
  return {
    records,
    audit,
    saved,
    setSessionId: (id: string) => {
      sessionId = id;
    },
    lifecycle: (event: string) => {
      for (const handler of handlers.get(event) ?? []) handler();
    },
    listenerCount: () => Array.from(handlers.values()).reduce((count, set) => count + set.size, 0),
    answer: (id: string, value: string | undefined) => {
      const finish = dialogs.get(id);
      if (!finish) throw new Error("No live synthetic dialog.");
      finish(value);
    },
    async invoke(name: string, id: string, args: unknown, signal?: AbortSignal, blocked = false) {
      // Pi 1.1.0 emits start BEFORE registration lookup, validation and blocking hooks.
      output({ type: "tool_execution_start", toolCallId: id, toolName: name, args });
      let result: unknown;
      let isError = false;
      try {
        const tool = tools.get(name);
        if (!tool) throw new Error("Unknown tool");
        const validated: unknown = Reflect.apply(validate, undefined, [
          tool,
          { id, name, arguments: args },
        ]);
        if (blocked || signal?.aborted) throw new Error("Blocked or aborted");
        result = await tool.execute(id, validated, signal, undefined, ctx);
      } catch {
        isError = true;
        result = {
          content: [{ type: "text", text: "Synthetic execution refused" }],
          details: undefined,
        };
      }
      output({ type: "tool_execution_end", toolCallId: id, toolName: name, result, isError });
      return result;
    },
  };
}

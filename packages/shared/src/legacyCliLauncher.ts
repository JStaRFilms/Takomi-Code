/**
 * Pre-0.0.41 services need this Node entry point until their first executable update rewrites the unit.
 * Forward argv, stdio, IPC, signals and exit status to the installed Takomi platform executable.
 * Remove once no supported release predates the executable.
 */
export function legacyCliLauncherScript(): string {
  return `import { spawn } from "node:child_process";
import { constants } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const executableName = process.platform === "win32" ? "t3.exe" : "t3";
const executable = join(dirname(require.resolve("@johnsax/takomi-code-" + process.platform + "-" + process.arch + "/package.json")), executableName);
const ipc = process.send !== undefined;
const child = spawn(executable, process.argv.slice(2), {
  stdio: ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
  env: { ...process.env, T3CODE_NPM_LAUNCHER_PATH: fileURLToPath(new URL("../bin/takomi-code.js", import.meta.url)) },
});
const fail = (error) => {
  if (!error) return;
  process.stderr.write("takomi-code: " + error.message + "\\n");
  child.kill("SIGTERM");
  process.exitCode = 1;
};
if (ipc) {
  process.on("message", (message) => { if (child.connected) child.send(message, fail); });
  child.on("message", (message) => { if (process.connected) process.send(message, fail); });
  process.on("disconnect", () => { if (child.connected) child.disconnect(); });
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { if (ipc || signal !== "SIGINT") child.kill(signal); });
}
child.on("error", (error) => { fail(error); process.exit(1); });
child.on("exit", (code, signal) => process.exit(code ?? 128 + (constants.signals[signal] || 1)));
`;
}

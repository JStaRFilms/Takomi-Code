#!/usr/bin/env node
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

const child = NodeChildProcess.spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    NodeURL.fileURLToPath(new URL("./src/bin.ts", import.meta.url)),
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
  },
);
child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === null ? 0 : 1);
});

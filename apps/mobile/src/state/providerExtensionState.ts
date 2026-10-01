import { createEnvironmentExtensionStateAtoms } from "@t3tools/client-runtime/state/providerExtensionState";
import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";
import { environmentThreadShells } from "./threads";

export const environmentExtensionState = createEnvironmentExtensionStateAtoms(
  connectionAtomRuntime,
  {
    threadShellAtom: environmentThreadShells.threadShellAtom,
    configValueAtom: serverEnvironment.configValueAtom,
  },
);

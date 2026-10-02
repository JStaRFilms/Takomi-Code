import { createEnvironmentPiSessionStatsAtoms } from "@t3tools/client-runtime/state/piSessionStats";
import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";
import { environmentThreadShells } from "./threads";
import { environmentExtensionState } from "./providerExtensionState";

export const environmentPiSessionStats = createEnvironmentPiSessionStatsAtoms(
  connectionAtomRuntime,
  {
    threadShellAtom: environmentThreadShells.threadShellAtom,
    configValueAtom: serverEnvironment.configValueAtom,
    extensionStateAtom: environmentExtensionState.stateAtom,
  },
);

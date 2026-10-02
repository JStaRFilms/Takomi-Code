import { createEnvironmentPiQueueStateAtoms } from "@t3tools/client-runtime/state/piQueueState";
import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";
import { environmentThreadShells } from "./threads";
import { environmentExtensionState } from "./providerExtensionState";

export const environmentPiQueueState = createEnvironmentPiQueueStateAtoms(connectionAtomRuntime, {
  threadShellAtom: environmentThreadShells.threadShellAtom,
  configValueAtom: serverEnvironment.configValueAtom,
  extensionStateAtom: environmentExtensionState.stateAtom,
});

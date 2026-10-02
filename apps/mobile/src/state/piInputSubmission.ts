import { createEnvironmentPiInputSubmissionAtoms } from "@t3tools/client-runtime/state/piInputSubmission";
import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";
import { environmentThreadShells } from "./threads";
import { environmentExtensionState } from "./providerExtensionState";

export const environmentPiInputSubmission = createEnvironmentPiInputSubmissionAtoms(
  connectionAtomRuntime,
  {
    threadShellAtom: environmentThreadShells.threadShellAtom,
    configValueAtom: serverEnvironment.configValueAtom,
    extensionStateAtom: environmentExtensionState.stateAtom,
  },
);

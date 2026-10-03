import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";

export const piVaultExportTake = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pi-vault-export:take",
  tag: WS_METHODS.providerTakePiVaultExport,
});

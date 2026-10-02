import { ProviderPiQueueState } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

// Native get_state also contains model/session fields. Only these fields leave the adapter.
export const NativePiQueueStateResponse = Schema.Struct({
  type: Schema.Literal("response"),
  command: Schema.Literal("get_state"),
  success: Schema.Literal(true),
  data: Schema.Struct({
    pendingMessageCount: ProviderPiQueueState.fields.pendingMessageCount,
    steeringMode: ProviderPiQueueState.fields.steeringMode,
    followUpMode: ProviderPiQueueState.fields.followUpMode,
    isStreaming: ProviderPiQueueState.fields.isStreaming,
    isCompacting: ProviderPiQueueState.fields.isCompacting,
  }),
});
export const decodeNativePiQueueState = Schema.decodeUnknownEffect(NativePiQueueStateResponse);

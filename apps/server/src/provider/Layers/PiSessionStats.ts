import { ProviderPiSessionStats } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

// Select numeric fields before constructing the public DTO. Native paths, IDs
// and extension fields never enter runtime events or logs.
export const NativePiSessionStatsResponse = Schema.Struct({
  type: Schema.Literal("response"),
  command: Schema.Literal("get_session_stats"),
  success: Schema.Literal(true),
  data: Schema.Struct({
    userMessages: ProviderPiSessionStats.fields.messages.fields.user,
    assistantMessages: ProviderPiSessionStats.fields.messages.fields.assistant,
    toolCalls: ProviderPiSessionStats.fields.messages.fields.toolCalls,
    toolResults: ProviderPiSessionStats.fields.messages.fields.toolResults,
    totalMessages: ProviderPiSessionStats.fields.messages.fields.total,
    tokens: ProviderPiSessionStats.fields.tokens,
    cost: ProviderPiSessionStats.fields.cost.fields.amount,
    contextUsage: Schema.optional(
      Schema.Struct({
        tokens: Schema.NullOr(ProviderPiSessionStats.fields.tokens.fields.total),
        contextWindow: ProviderPiSessionStats.fields.tokens.fields.total.check(
          Schema.isGreaterThan(0),
        ),
        percent: Schema.NullOr(ProviderPiSessionStats.fields.cost.fields.amount),
      }),
    ),
  }),
});

export const decodeNativePiSessionStats = Schema.decodeUnknownEffect(NativePiSessionStatsResponse);

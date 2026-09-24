import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import type { ThreadTaskStep } from "./thread-task-progress";

export function ThreadTasks({
  steps,
  turnId,
  maxListHeight,
}: {
  readonly steps: ReadonlyArray<ThreadTaskStep>;
  readonly turnId: string;
  readonly maxListHeight: number;
}) {
  const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);
  const expanded = expandedTurnId === turnId;
  const completed = steps.filter((step) => step.status === "completed").length;
  const current =
    steps.find((step) => step.status === "inProgress") ??
    steps.find((step) => step.status === "pending");
  const occurrences = new Map<string, number>();

  return (
    <View className="overflow-hidden rounded-[20px] border border-border bg-card-alt">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Tasks, ${completed} of ${steps.length} complete${current ? `. Current task: ${current.step}` : ""}`}
        onPress={() => setExpandedTurnId(expanded ? null : turnId)}
        className="min-h-12 flex-row items-center gap-2.5 px-4 py-3 active:opacity-70"
      >
        <SymbolView name="text.alignleft" size={16} tintColorClassName="accent-icon-muted" />
        <Text className="text-sm text-foreground-secondary">Tasks</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
          {current?.step ?? steps.at(-1)?.step}
        </Text>
        <Text className="text-xs tabular-nums text-foreground-secondary">
          {completed}/{steps.length}
        </Text>
        <SymbolView
          name={expanded ? "chevron.up" : "chevron.down"}
          size={12}
          tintColorClassName="accent-icon-muted"
        />
      </Pressable>
      {expanded && maxListHeight > 0 ? (
        <ScrollView style={{ maxHeight: maxListHeight }} bounces={false} nestedScrollEnabled>
          <View className="border-t border-border-subtle px-4 py-2">
            {steps.map((step) => {
              const occurrence = occurrences.get(step.step) ?? 0;
              occurrences.set(step.step, occurrence + 1);
              return (
                <View
                  key={`${step.step}:${occurrence}`}
                  accessible
                  accessibilityLabel={`${step.status === "completed" ? "Completed" : step.status === "inProgress" ? "Running" : "Pending"}: ${step.step}`}
                  className="flex-row items-start gap-3 py-2"
                >
                  <SymbolView
                    name={step.status === "completed" ? "checkmark.circle" : "circle"}
                    size={16}
                    tintColorClassName={
                      step.status === "completed"
                        ? "accent-icon"
                        : step.status === "inProgress"
                          ? "accent-focus"
                          : "accent-icon-muted"
                    }
                  />
                  <Text
                    className={
                      step.status === "inProgress"
                        ? "min-w-0 flex-1 text-sm text-foreground"
                        : "min-w-0 flex-1 text-sm text-foreground-secondary"
                    }
                  >
                    {step.step}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

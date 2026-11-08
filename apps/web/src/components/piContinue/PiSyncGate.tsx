import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";

import { piSessionUpdateCheck } from "~/state/piSessions";

const noUpdate = Atom.make(null);

export function usePiSyncUpdate(target: ScopedThreadRef | null) {
  const result = useAtomValue(
    target
      ? piSessionUpdateCheck({
          environmentId: target.environmentId,
          input: { threadId: target.threadId },
        })
      : noUpdate,
  );
  const data = result === null ? null : Option.getOrNull(AsyncResult.value(result));
  return data && data.available && data.newMessages > 0 && data.updateKey
    ? { newMessages: data.newMessages, updateKey: data.updateKey }
    : null;
}

import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Option from "effect/Option";
import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import { piSessionUpdateCheck } from "~/state/piSessions";

export interface PiSyncUpdate {
  readonly newMessages: number;
  readonly updateKey: string;
}

/**
 * Background poll for CLI advances on a continued thread. Mounted only while
 * eligible (Pi thread with backfilled history); reports through onUpdate so
 * the composer banner stack can offer one-click Sync. Renders nothing.
 */
export function PiSyncCheckGate({
  environmentId,
  threadId,
  onUpdate,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly onUpdate: Dispatch<SetStateAction<PiSyncUpdate | null>>;
}) {
  const queryAtom = useMemo(
    () => piSessionUpdateCheck({ environmentId, input: { threadId } }),
    [environmentId, threadId],
  );
  const result = useAtomValue(queryAtom);
  const data = Option.getOrNull(AsyncResult.value(result));
  useEffect(() => {
    const next: PiSyncUpdate | null =
      data && data.available && data.newMessages > 0 && data.updateKey
        ? { newMessages: data.newMessages, updateKey: data.updateKey }
        : null;
    onUpdate((previous) =>
      previous?.updateKey === next?.updateKey && previous?.newMessages === next?.newMessages
        ? previous
        : next,
    );
  }, [data, onUpdate]);
  return null;
}

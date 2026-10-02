import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { piSessionStatsLines } from "@t3tools/client-runtime/state/piSessionStats";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useContext, useEffect } from "react";
import { environmentPiSessionStats } from "../../state/piSessionStats";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";

export function PiSessionStatsDetails({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const openAtom = environmentPiSessionStats.openAtom(threadRef);
  const open = useAtomValue(openAtom);
  const { environmentId, threadId } = threadRef;
  useEffect(
    () => () =>
      registry.set(environmentPiSessionStats.openAtom({ environmentId, threadId }), false),
    [registry, environmentId, threadId],
  );
  return (
    <Dialog open={open} onOpenChange={(value) => registry.set(openAtom, value)}>
      <DialogPopup>
        <DialogTitle>Session statistics</DialogTitle>
        <DialogDescription>
          Cumulative native usage and the current context estimate.
        </DialogDescription>
        {open ? <PiSessionStatsContent threadRef={threadRef} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

export function PiSessionStatsContent({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const state = useAtomValue(environmentPiSessionStats.stateAtom(threadRef));
  return (
    <div className="flex flex-col gap-3 text-sm">
      {state.message ? (
        <div role={state.status === "error" ? "alert" : "status"}>{state.message}</div>
      ) : null}
      {state.snapshot ? (
        <div className="flex flex-col gap-2 tabular-nums">
          {piSessionStatsLines(state.snapshot).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={!state.canRefresh}
        onClick={() => environmentPiSessionStats.refresh(registry, threadRef)}
      >
        Refresh
      </Button>
    </div>
  );
}

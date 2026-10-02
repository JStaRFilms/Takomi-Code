import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { piQueueStateLines } from "@t3tools/client-runtime/state/piQueueState";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useContext, useEffect } from "react";
import { environmentPiQueueState } from "../../state/piQueueState";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";

export function PiQueueDetails({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const openAtom = environmentPiQueueState.openAtom(threadRef);
  const open = useAtomValue(openAtom);
  const { environmentId, threadId } = threadRef;
  useEffect(
    () => () => registry.set(environmentPiQueueState.openAtom({ environmentId, threadId }), false),
    [registry, environmentId, threadId],
  );
  return (
    <Dialog open={open} onOpenChange={(value) => registry.set(openAtom, value)}>
      <DialogPopup>
        <DialogTitle>Native queue</DialogTitle>
        <DialogDescription>
          Combined native pending count and read-only delivery modes.
        </DialogDescription>
        {open ? <PiQueueContent threadRef={threadRef} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

export function PiQueueContent({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const state = useAtomValue(environmentPiQueueState.stateAtom(threadRef));
  return (
    <div className="flex flex-col gap-3 text-sm">
      {state.message ? (
        <div role={state.status === "error" ? "alert" : "status"}>{state.message}</div>
      ) : null}
      {state.snapshot ? (
        <div className="flex flex-col gap-2 tabular-nums">
          {piQueueStateLines(state.snapshot).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={!state.canRefresh}
        onClick={() => environmentPiQueueState.refresh(registry, threadRef)}
      >
        Refresh
      </Button>
    </div>
  );
}

import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

const state = vi.hoisted(() => ({
  catalogAtom: {},
  permissionAtom: {},
  attachCommand: {},
  forkCommand: {},
  refresh: vi.fn(),
  createThread: vi.fn(),
  attach: vi.fn(),
  fork: vi.fn(),
  navigate: vi.fn(),
  deleteThread: vi.fn(),
  setTarget: vi.fn(),
}));

vi.mock("@effect/atom-react", async () => ({
  RegistryContext: (await import("react")).createContext({ refresh: state.refresh }),
  useAtomValue: (atom: unknown) =>
    atom === state.permissionAtom
      ? true
      : atom === state.catalogAtom
        ? AsyncResult.success({
            entries: [
              {
                id: "session-1",
                name: "CLI work",
                model: "pi-default",
                modifiedAt: "2026-01-01T00:00:00Z",
                entryCount: 4,
                entryCountExact: true,
                compatibility: "compatible",
              },
            ],
            nextPageAvailable: false,
          })
        : {
            environmentId: "env-1",
            projectId: "project-1",
            providerInstanceId: "pi",
            model: "pi-default",
            providerDisplayName: "Pi",
            canFork: true,
          },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => state.navigate,
}));
vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: { set: state.setTarget, refresh: state.refresh },
}));
vi.mock("~/lib/utils", () => ({ newThreadId: () => "thread-1" }));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { create: "create", delete: "delete" },
}));
vi.mock("~/state/piSessions", () => ({
  piSessionCatalog: () => state.catalogAtom,
  piSessionAttach: Object.assign(state.attachCommand, {
    permissionAtom: () => state.permissionAtom,
  }),
  piSessionFork: Object.assign(state.forkCommand, { permissionAtom: () => state.permissionAtom }),
}));
vi.mock("~/state/use-atom-command", async () => ({
  useAtomCommand: (command: unknown) =>
    command === "create"
      ? state.createThread
      : command === "delete"
        ? state.deleteThread
        : command === state.forkCommand
          ? state.fork
          : state.attach,
}));
vi.mock("~/composerDraftStore", () => ({ useComposerDraftStore: { getState: vi.fn() } }));
vi.mock("../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("../ui/dialog", () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    Dialog: Container,
    DialogDescription: Container,
    DialogHeader: Container,
    DialogPanel: Container,
    DialogPopup: Container,
    DialogTitle: Container,
  };
});
vi.mock("../ui/discovery-list", () => ({
  DiscoveryList: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../ui/toast", () => ({
  stackedThreadToast: vi.fn(),
  toastManager: { add: vi.fn() },
}));
vi.mock("./PiSessionMessages", () => ({ PiSessionMessageList: () => null }));

import { PiContinueDialogHost } from "./PiContinueDialog";

function setup() {
  vi.resetAllMocks();
  state.createThread.mockResolvedValue(AsyncResult.success(undefined));
}

describe("Continue CLI session", () => {
  it("shows progress, keeps a failed thread, and lets the user open it", async () => {
    setup();
    const failure = AsyncResult.failure(Cause.fail(new Error("Session timed out")));
    let resolveAttach: ((result: typeof failure) => void) | undefined;
    state.attach.mockReturnValue(
      new Promise<typeof failure>((resolve) => {
        resolveAttach = resolve;
      }),
    );
    await using screen = await render(<PiContinueDialogHost />);
    await screen.getByRole("button", { name: "Continue", exact: true }).click();
    await expect.element(screen.getByRole("status")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled();
    expect(resolveAttach).toBeDefined();
    await act(async () => {
      resolveAttach?.(failure);
    });

    expect(state.createThread).toHaveBeenCalledOnce();
    expect(state.attach).toHaveBeenCalledOnce();
    expect(state.deleteThread).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("alert")).toHaveTextContent("Session timed out");
    await screen.getByRole("button", { name: "Open thread" }).click();
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: "env-1", threadId: "thread-1" },
    });
  });

  it("reports an interrupted request without deleting the thread", async () => {
    setup();
    state.attach.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
    await using screen = await render(<PiContinueDialogHost />);
    await screen.getByRole("button", { name: "Continue", exact: true }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Connection interrupted while continuing the session.");
    expect(state.deleteThread).not.toHaveBeenCalled();
  });
});

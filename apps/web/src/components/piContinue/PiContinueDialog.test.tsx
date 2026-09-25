import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  catalogAtom: {},
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
    atom === state.catalogAtom
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
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: { set: state.setTarget } }));
vi.mock("~/lib/utils", () => ({ newThreadId: () => "thread-1" }));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { create: "create", delete: "delete" },
}));
vi.mock("~/state/piSessions", () => ({
  piSessionCatalog: () => state.catalogAtom,
  piSessionAttach: "attach",
  piSessionFork: "fork",
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: string) =>
    command === "create"
      ? state.createThread
      : command === "delete"
        ? state.deleteThread
        : command === "fork"
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

let renderer: ReactTestRenderer;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.createThread.mockResolvedValue(AsyncResult.success(undefined));
});

afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("Continue CLI session", () => {
  it("shows progress, keeps a failed thread, and lets the user open it", async () => {
    const failure = AsyncResult.failure(Cause.fail(new Error("Session timed out")));
    let resolveAttach: ((result: typeof failure) => void) | undefined;
    state.attach.mockReturnValue(
      new Promise<typeof failure>((resolve) => {
        resolveAttach = resolve;
      }),
    );
    await act(() => {
      renderer = create(<PiContinueDialogHost />);
    });
    const continueButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Continue"));
    expect(continueButton).toBeDefined();
    await act(async () => {
      continueButton?.props.onClick();
    });
    expect(renderer.root.findByProps({ role: "status" })).toBeDefined();
    expect(
      renderer.root
        .findAllByType("button")
        .some((button) => button.children.includes("Continuing…")),
    ).toBe(true);
    expect(resolveAttach).toBeDefined();
    await act(async () => {
      resolveAttach?.(failure);
    });

    expect(state.createThread).toHaveBeenCalledOnce();
    expect(state.attach).toHaveBeenCalledOnce();
    expect(state.deleteThread).not.toHaveBeenCalled();
    expect(
      renderer.root
        .findByProps({ role: "alert" })
        .findAllByType("div")
        .some((node) => node.children.includes("Session timed out")),
    ).toBe(true);

    const openThread = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Open thread"));
    await act(async () => {
      openThread?.props.onClick();
    });
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: "env-1", threadId: "thread-1" },
    });
  });

  it("reports an interrupted request without deleting the thread", async () => {
    state.attach.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
    await act(() => {
      renderer = create(<PiContinueDialogHost />);
    });
    const continueButton = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Continue"));
    await act(async () => {
      continueButton?.props.onClick();
    });

    expect(state.deleteThread).not.toHaveBeenCalled();
    expect(
      renderer.root
        .findByProps({ role: "alert" })
        .findAllByType("div")
        .some((node) =>
          node.children.includes("Connection interrupted while continuing the session."),
        ),
    ).toBe(true);
  });
});

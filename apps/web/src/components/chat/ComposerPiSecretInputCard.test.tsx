import { ApprovalRequestId } from "@t3tools/contracts";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

const requestId = ApprovalRequestId.make("secret-request");
const prompt = {
  requestId,
  createdAt: "2026-08-15T00:00:00.000Z",
  dismissible: false,
  questions: [
    {
      id: "secret",
      header: "Credential",
      question: "Enter the access token",
      options: [],
      sensitive: true,
      multiSelect: false,
    },
  ],
};
let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

function panel(
  onRespondPiSecret: (
    id: typeof requestId,
    response: { value: string } | { cancelled: true },
  ) => Promise<boolean>,
  unavailable = false,
  secretScope = "env:thread",
) {
  return (
    <ComposerPendingUserInputPanel
      pendingUserInputs={[prompt]}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onAdvance={() => {}}
      onDismiss={() => {}}
      onRespondPiSecret={onRespondPiSecret}
      environmentUnavailable={unavailable}
      secretScope={secretScope}
    />
  );
}

async function mount(
  onRespondPiSecret: (
    id: typeof requestId,
    response: { value: string } | { cancelled: true },
  ) => Promise<boolean>,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(panel(onRespondPiSecret));
  });
}

function input() {
  return renderer!.root.findByProps({ type: "password" });
}

describe("Pi credential prompt", () => {
  it("submits only via the secret response and clears the field before the request settles", async () => {
    let resolve!: (result: boolean) => void;
    const response = new Promise<boolean>((done) => {
      resolve = done;
    });
    const respond = vi.fn(() => response);
    await mount(respond);
    await act(() => input().props.onChange({ currentTarget: { value: "private-token" } }));
    await act(() => {
      input().props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
    });
    expect(respond).toHaveBeenCalledWith(requestId, { value: "private-token" });
    expect(input().props.value).toBe("");
    expect(input().props.disabled).toBe(true);
    await act(async () => {
      resolve(false);
      await response;
    });
    expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).not.toContain(
      "private-token",
    );
    expect(input().props.value).toBe("");
  });

  it("does not show a rejected RPC's error details", async () => {
    await mount(async () => {
      throw new Error("private-token");
    });
    await act(() => input().props.onChange({ currentTarget: { value: "private-token" } }));
    await act(async () => {
      input().props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
    });
    expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).not.toContain(
      "private-token",
    );
    expect(input().props.value).toBe("");
  });

  it("accepts an empty response when Pi requests one", async () => {
    const respond = vi.fn(async () => true);
    await mount(respond);
    await act(() => {
      input().props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
    });
    expect(respond).toHaveBeenCalledWith(requestId, { value: "" });
  });

  it("cancels without a value and clears typed input", async () => {
    const respond = vi.fn(async () => true);
    await mount(respond);
    await act(() => input().props.onChange({ currentTarget: { value: "private-token" } }));
    await act(async () => {
      renderer!.root.findByProps({ children: "Cancel" }).props.onClick();
    });
    expect(respond).toHaveBeenCalledWith(requestId, { cancelled: true });
    expect(input().props.value).toBe("");
  });

  it("clears on disconnect and on changing thread scope, disabling response while disconnected", async () => {
    const respond = vi.fn(async () => true);
    await mount(respond);
    await act(() => input().props.onChange({ currentTarget: { value: "private-token" } }));
    await act(() => renderer!.update(panel(respond, true)));
    expect(input().props.value).toBe("");
    expect(input().props.disabled).toBe(true);
    await act(() => renderer!.update(panel(respond, false)));
    await act(() => input().props.onChange({ currentTarget: { value: "another-token" } }));
    await act(() => renderer!.update(panel(respond, false, "other-env:thread")));
    expect(input().props.value).toBe("");
    expect(respond).not.toHaveBeenCalled();
  });
});

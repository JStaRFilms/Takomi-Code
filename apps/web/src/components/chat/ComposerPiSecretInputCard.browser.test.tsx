import { EnvironmentId, ThreadId, RuntimeRequestId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

const requestId = RuntimeRequestId.make("secret-request");
const prompt = {
  requestId,
  createdAt: "2026-08-15T00:00:00.000Z",
  dismissible: false,
  responseCapability: "live" as const,
  questions: [
    {
      id: "secret",
      header: "GOOGLE_CLIENT_SECRET",
      question:
        "Enter GOOGLE_CLIENT_SECRET.\n\nService: Google\nHost: accounts.google.com\n\nPurpose: Connect the app to Google sign-in.\n\nThis value won't be saved in the thread.",
      options: [],
      sensitive: true,
      multiSelect: false,
    },
  ],
};

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
      cwd={undefined}
      threadRef={{ environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") }}
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

describe("Pi credential prompt", () => {
  it("shows named field instructions in separate paragraphs and clears private input before the response settles", async () => {
    let resolve!: (result: boolean) => void;
    const response = new Promise<boolean>((done) => {
      resolve = done;
    });
    const respond = vi.fn(() => response);
    await using screen = await render(panel(respond));
    const field = screen.getByLabelText("GOOGLE_CLIENT_SECRET");
    await expect.element(field).toHaveAttribute("type", "password");
    const fieldElement = field.element();
    const instructions = screen.container.querySelector(
      `[id="${fieldElement.getAttribute("aria-describedby")}"]`,
    );
    expect(Array.from(instructions?.querySelectorAll("p") ?? [], (p) => p.textContent)).toEqual([
      "Enter GOOGLE_CLIENT_SECRET.",
      "Service: Google\nHost: accounts.google.com",
      "Purpose: Connect the app to Google sign-in.",
      "This value won't be saved in the thread.",
    ]);
    await field.fill("private-token");
    await expect.element(field).toHaveValue("private-token");
    expect(instructions?.textContent).not.toContain("private-token");
    await userEvent.keyboard("{Enter}");
    expect(respond).toHaveBeenCalledWith(requestId, { value: "private-token" });
    await expect.element(field).toHaveValue("");
    await expect.element(field).toBeDisabled();
    await act(async () => {
      resolve(false);
      await response;
    });
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toHaveTextContent("private-token");
    await expect.element(field).toHaveValue("");
  });

  it("does not show a rejected RPC's error details", async () => {
    await using screen = await render(
      panel(async () => {
        throw new Error("private-token");
      }),
    );
    const field = screen.getByLabelText("GOOGLE_CLIENT_SECRET");
    await field.fill("private-token");
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toHaveTextContent("private-token");
    await expect.element(field).toHaveValue("");
  });

  it("accepts an empty response when Pi requests one", async () => {
    const respond = vi.fn(async () => true);
    await using screen = await render(panel(respond));
    await screen.getByLabelText("GOOGLE_CLIENT_SECRET").click();
    await userEvent.keyboard("{Enter}");
    expect(respond).toHaveBeenCalledWith(requestId, { value: "" });
  });

  it("cancels without a value and clears typed input", async () => {
    const respond = vi.fn(async () => true);
    await using screen = await render(panel(respond));
    const field = screen.getByLabelText("GOOGLE_CLIENT_SECRET");
    await field.fill("private-token");
    await screen.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(respond).toHaveBeenCalledWith(requestId, { cancelled: true });
    await expect.element(field).toHaveValue("");
  });

  it("clears on disconnect and on changing thread scope, disabling response while disconnected", async () => {
    const respond = vi.fn(async () => true);
    await using screen = await render(panel(respond));
    const field = screen.getByLabelText("GOOGLE_CLIENT_SECRET");
    await field.fill("private-token");
    await screen.rerender(panel(respond, true));
    await expect.element(field).toHaveValue("");
    await expect.element(field).toBeDisabled();
    await screen.rerender(panel(respond, false));
    await field.fill("another-token");
    await screen.rerender(panel(respond, false, "other-env:thread"));
    await expect.element(field).toHaveValue("");
    expect(respond).not.toHaveBeenCalled();
  });
});

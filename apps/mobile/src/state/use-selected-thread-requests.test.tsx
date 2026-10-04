import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  drafts: {} as Record<string, unknown>,
  uploads: {} as Record<string, unknown>,
  preparations: {} as Record<string, number>,
  preparationAtom: Symbol("preparation"),
  sensitive: false,
  commands: [] as Array<{ command: unknown; input: unknown }>,
  activeCommand: Symbol("Pi secret RPC"),
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) =>
    atom === "drafts"
      ? fixture.drafts
      : atom === "uploads"
        ? fixture.uploads
        : atom === fixture.preparationAtom
          ? fixture.preparations
          : {},
}));
vi.mock("./use-composer-drafts", () => ({
  composerDraftsAtom: "drafts",
  clearComposerDraft: vi.fn(),
}));
vi.mock("./composer-attachment-uploads", async () => ({
  ...(await import("../lib/composerAttachmentUploadQueue")),
  composerAttachmentUploadsAtom: "uploads",
}));
vi.mock("./question-attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./question-attachments")>()),
  questionAttachmentPreparationAtom: fixture.preparationAtom,
}));
vi.mock("./entities", () => ({
  useServerConfigs: () =>
    new Map([
      [
        "environment-1",
        {
          environment: {
            capabilities: {
              questionAttachments: true,
              attachmentUploads: true,
              fileAttachments: { maxUploadBytes: 20_000_000 },
            },
          },
        },
      ],
    ]),
}));
vi.mock("./threads", () => ({ threadEnvironment: {} }));
vi.mock("./use-atom-command", () => ({
  useAtomCommand: (command: unknown) => (input: unknown) => {
    fixture.commands.push({ command, input });
    return Promise.resolve({ _tag: "Success" });
  },
}));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createEnvironmentRpcCommand: () => fixture.activeCommand,
}));
vi.mock("../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("./use-thread-selection", () => ({
  useThreadSelection: () => ({
    selectedThread: { environmentId: "environment-1", id: "thread-1" },
  }),
}));
vi.mock("./use-thread-detail", () => ({
  useSelectedThreadPendingRequests: () => ({
    approvals: [],
    userInputs: [
      {
        requestId: "request-1",
        createdAt: "2026-09-08T00:00:00Z",
        responseCapability: "live",
        dismissible: false,
        questions: ["first", "second"].map((id) => ({
          id,
          header: id,
          question: `Attach ${id} file`,
          options: [],
          allowCustomAnswer: true,
          multiSelect: false,
          ...(fixture.sensitive ? { sensitive: true } : {}),
        })),
      },
    ],
  }),
}));

import { ApprovalRequestId, EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import { questionAttachmentDraftKey } from "./question-attachments";
import { useSelectedThreadRequests } from "./use-selected-thread-requests";

function handlers() {
  const holder: { current?: ReturnType<typeof useSelectedThreadRequests> } = {};
  function Probe() {
    holder.current = useSelectedThreadRequests();
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (!holder.current) throw new Error("Request handlers were not rendered");
  return holder.current;
}

const environmentId = EnvironmentId.make("environment-1");
const key = (question: string) =>
  questionAttachmentDraftKey(
    environmentId,
    ThreadId.make("thread-1"),
    RuntimeRequestId.make("request-1"),
    question,
  );
function submitButtonMarkup() {
  function Probe() {
    const { activePendingUserInputAnswers } = useSelectedThreadRequests();
    return <button disabled={activePendingUserInputAnswers === null}>Submit answers</button>;
  }
  return renderToStaticMarkup(<Probe />);
}
beforeEach(() => {
  fixture.preparations = {};
  fixture.sensitive = false;
  fixture.commands = [];
  fixture.drafts = Object.fromEntries(
    ["first", "second"].map((id) => [
      key(id),
      {
        attachments: [
          {
            id,
            type: "file",
            name: `${id}.txt`,
            mimeType: "text/plain",
            sizeBytes: 4,
            fileUri: `file:///${id}.txt`,
          },
        ],
      },
    ]),
  );
  fixture.uploads = { "environment-1:first": { status: "ready" } };
});
describe("sensitive user input", () => {
  it("routes the credential only through the Pi RPC and blocks ordinary submission", async () => {
    fixture.sensitive = true;
    const requests = handlers();
    const question = requests.activePendingUserInput?.questions[0];
    if (!question) throw new Error("Expected a pending question");
    requests.onSelectUserInputOption(RuntimeRequestId.make("request-1"), question, "option");
    requests.onChangeUserInputCustomAnswer(
      RuntimeRequestId.make("request-1"),
      "first",
      "credential",
    );
    await requests.onSubmitUserInput();
    await requests.onDismissUserInput();
    expect(fixture.commands).toEqual([]);
    expect(
      await requests.onRespondPiSecret(RuntimeRequestId.make("request-1"), {
        value: "credential",
      }),
    ).toBe(true);
    expect(fixture.commands).toEqual([
      {
        command: fixture.activeCommand,
        input: {
          environmentId,
          input: {
            threadId: ThreadId.make("thread-1"),
            requestId: ApprovalRequestId.make("request-1"),
            value: "credential",
          },
        },
      },
    ]);
    fixture.commands = [];
    await requests.onRespondPiSecret(RuntimeRequestId.make("other"), { cancelled: true });
    expect(fixture.commands).toEqual([]);
    await requests.onRespondPiSecret(RuntimeRequestId.make("request-1"), { cancelled: true });
    expect(fixture.commands).toEqual([
      {
        command: fixture.activeCommand,
        input: {
          environmentId,
          input: {
            threadId: ThreadId.make("thread-1"),
            requestId: ApprovalRequestId.make("request-1"),
            cancelled: true,
          },
        },
      },
    ]);
  });
});

describe("question attachment submission readiness", () => {
  it.each([
    undefined,
    { status: "uploading", progress: 0.5 },
    { status: "failed", reason: "Offline" },
  ])("keeps Submit disabled until all question uploads finish: %j", (state) => {
    if (state) fixture.uploads["environment-1:second"] = state;
    expect(submitButtonMarkup()).toContain("disabled");
    fixture.uploads["environment-1:second"] = { status: "ready" };
    expect(submitButtonMarkup()).not.toContain("disabled");
  });
  it("ignores an upload in another environment", () => {
    fixture.uploads["environment-1:second"] = { status: "ready" };
    fixture.uploads["environment-2:second"] = { status: "uploading", progress: 0.5 };
    expect(submitButtonMarkup()).not.toContain("disabled");
  });
  it("waits for attachment preparation even when uploads are ready", () => {
    fixture.uploads["environment-1:second"] = { status: "ready" };
    fixture.preparations[key("first")] = 1;
    expect(submitButtonMarkup()).toContain("disabled");
  });
});

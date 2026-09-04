import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(fixtureDirectory, "pi-v0.84.4-rpc.json"), "utf8"));
const sessionRecords = readFileSync(join(fixtureDirectory, "pi-v0.84.4-session.v3.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const sessionEntries = sessionRecords.slice(1);
const entriesByParent = new Map();
for (const entry of sessionEntries) {
  const children = entriesByParent.get(entry.parentId) ?? [];
  children.push(entry);
  entriesByParent.set(entry.parentId, children);
}
const sessionTree = (entriesByParent.get(null) ?? []).map(function node(entry) {
  return { entry, children: (entriesByParent.get(entry.id) ?? []).map(node) };
});
const transcriptPath = process.env.T3_PI_CONFORMANCE_TRANSCRIPT;
let input = "";
let stateRequest;
let commandsRequest;

function emit(record, crlf = false) {
  process.stdout.write(`${JSON.stringify(record)}${crlf ? "\r\n" : "\n"}`);
}

function recordInput(line) {
  if (transcriptPath) appendFileSync(transcriptPath, `${line}\n`, "utf8");
}

function emitTimeoutRequest() {
  emit({
    type: "extension_ui_request",
    id: "timeout-confirm",
    method: "confirm",
    title: "Immediate timeout",
    message: "This must open before cancellation.",
    timeout: 0,
  });
}

function emitFixtureEvents() {
  if (process.env.T3_PI_CONFORMANCE_UI_TIMEOUT === "1") emitTimeoutRequest();
  if (process.env.T3_PI_CONFORMANCE_INVALID_UI_ID === "1") {
    emit({
      type: "extension_ui_request",
      id: "x".repeat(513),
      method: "confirm",
      title: "Invalid request ID",
      message: "This must not be persisted.",
    });
  }
  if (process.env.T3_PI_CONFORMANCE_MALFORMED === "1") process.stdout.write("{invalid\n");
  if (process.env.T3_PI_CONFORMANCE_OVERSIZED === "1") {
    process.stdout.write(`${"x".repeat(1024 * 1024 + 1)}\n`);
  }
  const bytes = Buffer.from(
    fixture.events
      .map((event, index) => `${JSON.stringify(event)}${index === 0 ? "\r\n" : "\n"}`)
      .join(""),
    "utf8",
  );
  const cr = bytes.indexOf(0x0d);
  const euro = bytes.indexOf(Buffer.from("€", "utf8"));
  const cuts = [cr + 1, euro + 1, euro + 3, bytes.length]
    .filter((cut, index, values) => cut > 0 && cut <= bytes.length && values.indexOf(cut) === index)
    .sort((left, right) => left - right);
  // Deliberately split the Euro sign and the first CRLF across writes while
  // allowing the final chunk to contain many complete JSONL records.
  let offset = 0;
  for (const cut of cuts) {
    process.stdout.write(bytes.subarray(offset, cut));
    offset = cut;
  }
}

function respondOutOfOrder() {
  if (!stateRequest || !commandsRequest) return;
  emit({
    type: "response",
    id: commandsRequest.id,
    command: "get_commands",
    success: true,
    data: { commands: fixture.slashCommands },
  });
  emit({
    type: "response",
    id: stateRequest.id,
    command: "get_state",
    success: true,
    data: fixture.state,
  });
  stateRequest = undefined;
  commandsRequest = undefined;
}

function handle(record) {
  if (process.env.T3_PI_CONFORMANCE_EARLY_EXIT === "1") {
    process.stderr.write("synthetic early exit\n");
    process.exit(17);
  }
  switch (record.type) {
    case "get_state":
      if (process.env.T3_PI_CONFORMANCE_OUT_OF_ORDER === "1") {
        stateRequest = record;
        respondOutOfOrder();
      } else {
        emit({
          type: "response",
          id: record.id,
          command: "get_state",
          success: true,
          data: fixture.state,
        });
      }
      break;
    case "get_commands":
      if (process.env.T3_PI_CONFORMANCE_OUT_OF_ORDER === "1") {
        commandsRequest = record;
        respondOutOfOrder();
      } else {
        emit({
          type: "response",
          id: record.id,
          command: "get_commands",
          success: true,
          data: { commands: fixture.slashCommands },
        });
      }
      break;
    case "prompt":
      emit({ type: "response", id: record.id, command: "prompt", success: true });
      if (process.env.T3_PI_CONFORMANCE_UNTERMINATED === "1") {
        process.stdout.end(
          `${JSON.stringify({ type: "extension_ui_request", id: "eof-confirm", method: "confirm", title: "EOF pending", message: "Cancel on EOF" })}\n{\"type\":\"partial\"`,
          () => process.exit(18),
        );
      } else if (process.env.T3_PI_CONFORMANCE_UI_TIMEOUT_ONLY === "1") {
        emitTimeoutRequest();
      } else {
        emitFixtureEvents();
      }
      break;
    case "get_entries":
      emit({
        type: "response",
        id: record.id,
        command: "get_entries",
        success: true,
        data: { entries: sessionEntries, leafId: "active-label" },
      });
      break;
    case "get_tree":
      emit({
        type: "response",
        id: record.id,
        command: "get_tree",
        success: true,
        data: { tree: sessionTree, leafId: "active-label" },
      });
      break;
    case "extension_ui_response":
      if (process.env.T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE === "1") {
        emit({
          type: "extension_ui_response_received",
          id: record.id,
          ...(record.cancelled === true ? { cancelled: true } : {}),
          ...(typeof record.confirmed === "boolean" ? { confirmed: record.confirmed } : {}),
          ...(typeof record.value === "string" ? { value: record.value } : {}),
        });
        emit({
          type: "extension_ui_request",
          id: `response-captured-${record.id}`,
          method: "notify",
          message: "Synthetic UI response captured.",
        });
      }
      break;
    case "abort":
      emit({ type: "response", id: record.id, command: "abort", success: true });
      // Pi can emit buffered lifecycle records after accepting abort.
      emit({
        type: "tool_execution_update",
        toolCallId: "tool-late",
        toolName: "bash",
        args: { command: "echo synthetic" },
        partialResult: { content: [{ type: "text", text: "late" }] },
      });
      emit({ type: "agent_settled" });
      break;
    default:
      emit({ type: "response", id: record.id, command: record.type, success: true });
  }
}

process.stdin.on("data", (chunk) => {
  input += chunk;
  while (true) {
    const newline = input.indexOf("\n");
    if (newline < 0) return;
    const line = input.slice(0, newline).replace(/\r$/, "");
    input = input.slice(newline + 1);
    if (!line) continue;
    recordInput(line);
    handle(JSON.parse(line));
  }
});

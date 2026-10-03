import { pathToFileURL } from "node:url";
import { join } from "node:path";

const [packagePath, directory, fixturePath] = process.argv.slice(2);
if (!packagePath || !directory || !fixturePath) throw new Error("Missing conformance paths.");

const { SessionManager } = await import(pathToFileURL(join(packagePath, "dist", "index.js")).href);

function treeEntryIds(nodes) {
  return nodes.flatMap((node) => [node.entry.id, ...treeEntryIds(node.children)]);
}

const session = SessionManager.open(fixturePath, directory);
const sourceEntries = session.getEntries();
const sourceLeafId = session.getLeafId();
const sourceBranch = session.getBranch();
const sourceTree = session.getTree();
const sourceCustom = sourceBranch.find(
  (entry) => entry.type === "custom" && entry.customType === "fixture.extension",
);
if (!sourceLeafId) throw new Error("Synthetic fixture has no active leaf.");
if (!sourceCustom) throw new Error("Synthetic fixture has no active custom state.");

const promptEntryId = session.appendMessage({
  role: "user",
  content: "Synthetic fixture continuation.",
  timestamp: 1788442600000,
});

const reopened = SessionManager.open(fixturePath, directory);
const reopenedEntries = reopened.getEntries();
const reopenedBranch = reopened.getBranch();
const reopenedTree = reopened.getTree();
const reopenedCustom = reopenedBranch.find(
  (entry) => entry.type === "custom" && entry.customType === "fixture.extension",
);
const promptEntry = reopenedEntries.find((entry) => entry.id === promptEntryId);

process.stdout.write(
  `${JSON.stringify({
    source: {
      headerVersion: session.getHeader().version,
      entryCount: sourceEntries.length,
      highWaterId: sourceEntries.at(-1)?.id ?? null,
      leafId: sourceLeafId,
      branchLeafId: sourceBranch.at(-1)?.id ?? null,
      customEntryId: sourceCustom.id,
      customData: sourceCustom.data,
      treeRoots: sourceTree.length,
      treeEntryIds: treeEntryIds(sourceTree),
    },
    appended: {
      promptEntryId,
      promptParentId: promptEntry?.parentId ?? null,
      content: promptEntry?.type === "message" ? promptEntry.message.content : null,
    },
    reopened: {
      entryCount: reopenedEntries.length,
      highWaterId: reopenedEntries.at(-1)?.id ?? null,
      leafId: reopened.getLeafId(),
      branchLeafId: reopenedBranch.at(-1)?.id ?? null,
      customEntryId: reopenedCustom?.id ?? null,
      customData: reopenedCustom?.data,
      treeRoots: reopenedTree.length,
      treeEntryIds: treeEntryIds(reopenedTree),
    },
  })}\n`,
);

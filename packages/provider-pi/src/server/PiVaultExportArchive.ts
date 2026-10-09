// @effect-diagnostics nodeBuiltinImport:off - File descriptor flags prevent following a swapped archive symlink.
import { PI_VAULT_ARCHIVE_MAX_BYTES } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

/** Read only the archive produced by a completed export; never follow a swapped symlink. */
export async function readPiVaultExportArchive(path: string): Promise<{
  readonly filename: string;
  readonly archive: string;
}> {
  const before = await NodeFSP.lstat(path);
  if (!before.isFile()) throw new Error("Invalid vault archive");
  const file = await NodeFSP.open(path, NodeFS.constants.O_RDONLY | NodeFS.constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    const after = await NodeFSP.lstat(path);
    if (
      !stat.isFile() ||
      !after.isFile() ||
      before.dev !== stat.dev ||
      before.ino !== stat.ino ||
      after.dev !== stat.dev ||
      after.ino !== stat.ino ||
      stat.size < 1 ||
      stat.size > PI_VAULT_ARCHIVE_MAX_BYTES
    ) {
      throw new Error("Invalid vault archive");
    }
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error("Vault archive changed");
    return {
      filename: NodePath.basename(path),
      archive: bytes.subarray(0, offset).toString("base64"),
    };
  } finally {
    await file.close();
  }
}

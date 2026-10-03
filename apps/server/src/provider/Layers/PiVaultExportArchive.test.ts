// @effect-diagnostics nodeBuiltinImport:off - Files in a temporary directory exercise descriptor-based archive reads.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { PI_VAULT_ARCHIVE_MAX_BYTES } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { readPiVaultExportArchive } from "./PiVaultExportArchive.ts";

describe("vault export archive read", () => {
  it("rejects an archive replaced by a symlink", async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pi-vault-archive-"));
    try {
      const target = NodePath.join(directory, "target.transfer");
      const archive = NodePath.join(directory, "archive.transfer");
      NodeFS.writeFileSync(target, "fake encrypted archive");
      NodeFS.symlinkSync(target, archive);
      await expect(readPiVaultExportArchive(archive)).rejects.toThrow();
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses archives larger than the transfer cap", async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pi-vault-archive-"));
    try {
      const archive = NodePath.join(directory, "archive.transfer");
      NodeFS.writeFileSync(archive, Buffer.alloc(PI_VAULT_ARCHIVE_MAX_BYTES + 1));
      await expect(readPiVaultExportArchive(archive)).rejects.toThrow("Invalid vault archive");
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });
});

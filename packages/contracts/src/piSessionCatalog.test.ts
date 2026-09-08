import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  PiChildSessionLeaseDiagnostics,
  PiSessionCatalogError,
  PiSessionCatalogInput,
  PiSessionCatalogPage,
} from "./piSessionCatalog.ts";

const decodeInput = Schema.decodeUnknownSync(PiSessionCatalogInput);
const decodePage = Schema.decodeUnknownSync(PiSessionCatalogPage);
const decodeDiagnostics = Schema.decodeUnknownSync(PiChildSessionLeaseDiagnostics);
const decodeError = Schema.decodeUnknownSync(PiSessionCatalogError);
const encodeError = Schema.encodeUnknownSync(PiSessionCatalogError);

describe("Pi session catalog contracts", () => {
  it("accepts opaque project/provider routing and bounded pagination only", () => {
    expect(
      decodeInput({ providerInstanceId: "pi", projectId: "project-a", limit: 50 }),
    ).toMatchObject({ providerInstanceId: "pi", projectId: "project-a", limit: 50 });
    expect(() =>
      decodeInput({ providerInstanceId: "pi", projectId: "project-a", limit: 51 }),
    ).toThrow();
    expect(() =>
      decodeInput({ providerInstanceId: "pi", projectId: "project-a", cursor: "x".repeat(129) }),
    ).toThrow();
  });

  it("preserves the catalog error wire shape", () => {
    const error = new PiSessionCatalogError({ reason: "deadline", message: "Catalog timed out" });

    expect(encodeError(error)).toEqual({
      _tag: "PiSessionCatalogError",
      reason: "deadline",
      message: "Catalog timed out",
    });
    expect(decodeError(encodeError(error))).toMatchObject({
      _tag: "PiSessionCatalogError",
      reason: "deadline",
      message: "Catalog timed out",
    });
  });

  it("bounds lease diagnostics payloads", () => {
    const lease = {
      childSessionId: "child",
      processGeneration: "process",
      expiresAt: "2026-09-03T13:36:00.000Z",
      state: "active",
      ownership: "exclusive",
    };
    expect(() =>
      decodeDiagnostics({
        leases: Array.from({ length: 101 }, () => lease),
        truncated: true,
        source: "takomi-verified-cloned-children-only",
      }),
    ).toThrow();
  });

  it("encodes no native path/id and distinguishes paging from a hard cap", () => {
    const page = decodePage({
      entries: [
        {
          id: "random-handle",
          name: "Safe session",
          cwd: "workspace",
          createdAt: "2026-09-03T13:36:00.000Z",
          modifiedAt: "2026-09-03T13:36:01.000Z",
          entryCount: 2,
          entryCountExact: false,
          parentSession: false,
          formatVersion: 3,
          compatibility: "truncated",
          fidelity: "metadata-truncated",
          activity: "unobservable",
          ownership: "external-source",
          source: "pi-jsonl",
        },
      ],
      nextPageAvailable: false,
      hardCapped: true,
      hardCeiling: 2_000,
      source: "pi-documented-session-storage",
    });
    expect(JSON.stringify(page)).not.toMatch(/native|path|filename/i);
    expect(page.nextPageAvailable).toBe(false);
    expect(page.hardCapped).toBe(true);
  });
});

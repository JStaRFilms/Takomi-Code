import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { PiSessionLifecycle } from "../PiSessionLifecycle.ts";
import { listBoundedPiSessions, validatePiSessionProvider } from "./PiSessionCatalog.ts";

describe("Pi session catalog server boundary", () => {
  it.effect("rejects an expired generation before provider or filesystem discovery", () =>
    listBoundedPiSessions({
      catalog: {
        providerInstanceId: ProviderInstanceId.make("pi"),
        projectId: ProjectId.make("project-a"),
      },
      serverSettings: DEFAULT_SERVER_SETTINGS,
      workspaceCanonicalPath: "/path-that-must-not-be-read",
      environmentId: "environment-a",
      serverGeneration: "server-generation",
      expiresAt: -1,
      lifecycle: new PiSessionLifecycle(),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error.reason).toBe("invalid_cursor");
          expect(error.message).not.toContain("path-that-must-not-be-read");
        }),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("uses the effective enabled state of a Takomi provider instance", () => {
    const providerInstanceId = ProviderInstanceId.make("takomi");
    const enabled: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [providerInstanceId]: {
          driver: ProviderDriverKind.make("pi"),
          enabled: true,
        },
      },
    };
    const disabled: ServerSettings = {
      ...enabled,
      providerInstances: {
        [providerInstanceId]: {
          driver: ProviderDriverKind.make("pi"),
          enabled: false,
        },
      },
    };
    return Effect.gen(function* () {
      yield* validatePiSessionProvider(enabled, providerInstanceId);
      const error = yield* Effect.flip(validatePiSessionProvider(disabled, providerInstanceId));
      expect(error.message).toBe("This Pi provider instance is disabled.");
    });
  });

  it.effect("does not reject an enabled Takomi catalog before package discovery", () => {
    const providerInstanceId = ProviderInstanceId.make("takomi");
    const settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [providerInstanceId]: {
          driver: ProviderDriverKind.make("pi"),
          enabled: true,
          config: { binaryPath: "missing-pi-catalog-binary" },
        },
      },
    };
    return listBoundedPiSessions({
      catalog: { providerInstanceId, projectId: ProjectId.make("project-a") },
      serverSettings: settings,
      workspaceCanonicalPath: "/not-a-real-workspace",
      environmentId: "environment-a",
      serverGeneration: "server-generation",
      expiresAt: Number.MAX_SAFE_INTEGER,
      lifecycle: new PiSessionLifecycle(),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => expect(error.message).toBe("Pi session discovery is unavailable.")),
      ),
      Effect.provide(NodeServices.layer),
    );
  });

  it.effect("rejects non-Pi provider instances without path detail", () => {
    const settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codexOther")]: {
          driver: ProviderDriverKind.make("codex"),
          config: {},
        },
      },
    };
    return validatePiSessionProvider(settings, ProviderInstanceId.make("codexOther")).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error.reason).toBe("provider_unavailable");
          expect(error.message).not.toMatch(/[\\/]/);
        }),
      ),
    );
  });
});

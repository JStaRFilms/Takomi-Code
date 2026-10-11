import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import {
  BearerConnectionProfile,
  BearerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import {
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  setRoutesInCatalog,
} from "@t3tools/client-runtime/platform";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import { CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY, make } from "./catalog-store";
import * as MobileSecureStorage from "../persistence/mobile-secure-storage";

function makeStorage(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  const deleted: Array<string> = [];
  const storage = MobileSecureStorage.MobileSecureStorage.of({
    getItem: (key) => Effect.sync(() => values.get(key) ?? null),
    setItem: (key, value) =>
      Effect.sync(() => {
        values.set(key, value);
      }),
    removeItem: (key) =>
      Effect.sync(() => {
        deleted.push(key);
        values.delete(key);
      }),
  });
  return { deleted, storage, values };
}

describe("mobile connection catalog storage", () => {
  it.effect(
    "persists route and profile labels together without requiring or changing bearer credentials",
    () =>
      Effect.gen(function* () {
        const environmentId = EnvironmentId.make("label-test");
        const targets = ["lan", "tailscale"].map(
          (connectionId) =>
            new BearerConnectionTarget({ environmentId, connectionId, label: "JOHNSAX" }),
        );
        const profiles = targets.map(
          (target) =>
            new BearerConnectionProfile({
              environmentId,
              connectionId: target.connectionId,
              label: target.label,
              httpBaseUrl:
                target.connectionId === "lan"
                  ? "http://192.168.100.5:3773/"
                  : "https://johnsax.tailb6e2d3.ts.net:4444/",
              wsBaseUrl:
                target.connectionId === "lan"
                  ? "ws://192.168.100.5:3773/"
                  : "wss://johnsax.tailb6e2d3.ts.net:4444/",
            }),
        );
        const initial = { ...EMPTY_CONNECTION_CATALOG_DOCUMENT, targets, profiles };
        const memory = makeStorage({ [CONNECTION_CATALOG_KEY]: JSON.stringify(initial) });
        const catalog = yield* make().pipe(
          Effect.provideService(MobileSecureStorage.MobileSecureStorage, memory.storage),
        );
        yield* catalog.update((document) =>
          setRoutesInCatalog(
            document,
            environmentId,
            targets.map((target) => new BearerConnectionTarget({ ...target, label: "Takomi" })),
          ),
        );
        const reloaded = yield* make().pipe(
          Effect.provideService(MobileSecureStorage.MobileSecureStorage, memory.storage),
        );
        expect(yield* reloaded.read).toEqual({
          ...initial,
          targets: targets.map((target) => ({ ...target, label: "Takomi" })),
          profiles: profiles.map((profile) => ({ ...profile, label: "Takomi" })),
        });
        expect(memory.deleted).toEqual([]);
      }),
  );

  it.effect("recovers from a corrupt current catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage.MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);
    }),
  );

  it.effect("replaces and removes a corrupt legacy catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({ connections: [{ invalid: true }] }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage.MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([LEGACY_CONNECTIONS_KEY]);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
    }),
  );

  it.effect("falls back to valid legacy data when the current catalog is corrupt", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({
          connections: [
            {
              environmentId: "legacy-environment",
              environmentLabel: "Legacy",
              pairingUrl: "https://legacy.example.test/pair",
              displayUrl: "https://legacy.example.test",
              httpBaseUrl: "https://legacy.example.test",
              wsBaseUrl: "wss://legacy.example.test",
              bearerToken: "legacy-token",
              authenticationMethod: "bearer",
            },
          ],
        }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage.MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toHaveLength(1);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY]);

      yield* catalog.update((document) => document);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
      expect(memory.values.has(LEGACY_CONNECTIONS_KEY)).toBe(false);
    }),
  );
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock("../../../../scripts/lib/public-config.ts", () => ({ loadRepoEnv: () => fixture.env }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function config(env: Record<string, string | undefined>) {
  fixture.env = env;
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.stubEnv("MOBILE_VERSION_POLICY", undefined);
  vi.stubEnv("T3_SHOWCASE_CAPTURE_BUILD", undefined);
  vi.resetModules();
  return (await import("../../app.config")).default;
}

describe("fork mobile configuration", () => {
  it.each([
    ["production", "com.jstarstudios.takomicode", "takomi-code"],
    ["preview", "com.jstarstudios.takomicode.preview", "takomi-code-preview"],
    ["development", "com.jstarstudios.takomicode.dev", "takomi-code-dev"],
  ])(
    "keeps %s identity and disables OTA without an owned project",
    async (variant, identity, scheme) => {
      const value = await config({ APP_VARIANT: variant });
      expect(value.android?.package).toBe(identity);
      expect(value.ios?.bundleIdentifier).toBe(identity);
      expect(value.scheme).toBe(scheme);
      expect(value.updates?.enabled).toBe(false);
      expect(value.updates?.url).toBeUndefined();
      expect(value.owner).toBeUndefined();
      expect(value.extra?.eas).toBeUndefined();
      expect(value.ios?.appleTeamId).toBeUndefined();
    },
  );

  it("uses optional fork-owned services but never enables OTA for a staged GitHub APK", async () => {
    const env = {
      APP_VARIANT: "production",
      TAKOMI_EXPO_PROJECT_ID: "fork-project",
      TAKOMI_EXPO_OWNER: "fork-owner",
      TAKOMI_IOS_APPLE_TEAM_ID: "fork-team",
      TAKOMI_CLERK_RELYING_PARTY: "auth.example.test",
    };
    const eas = await config(env);
    expect(eas.updates?.enabled).toBe(true);
    expect(eas.updates?.url).toBe("https://u.expo.dev/fork-project");
    expect(eas.owner).toBe("fork-owner");
    expect(eas.ios?.appleTeamId).toBe("fork-team");
    expect(eas.ios?.associatedDomains).toContain("applinks:auth.example.test");
    const apk = await config({ ...env, T3CODE_MOBILE_UPDATES_ENABLED: "0" });
    expect(apk.updates?.enabled).toBe(false);
    expect(apk.android?.package).toBe("com.jstarstudios.takomicode");
  });

  it("keeps the EAS version override separate from Android's committed native code", async () => {
    const value = await config({ APP_VARIANT: "preview", T3CODE_MOBILE_VERSION: "3.0.0" });
    expect(value.version).toBe("3.0.0");
    expect(value.android?.versionCode).toBe(3);
    expect(value.android?.package).toBe("com.jstarstudios.takomicode.preview");
  });
});

import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("expo-image", () => ({ Image: "Image" }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("react-native-svg", () => ({ Svg: "Svg", Path: "Path" }));
vi.mock("./AppText", () => ({ AppText: "Text" }));

vi.mock("../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));

import { ProviderIcon } from "./ProviderIcon";

describe("mobile provider icon", () => {
  it("uses the Takomi glyph for its instance even before the provider snapshot arrives", () => {
    expect(ProviderIcon({ provider: "pi", instanceId: "takomi" })?.props.viewBox).toBe("0 0 32 32");
    expect(ProviderIcon({ provider: undefined, instanceId: "takomi" })?.props.viewBox).toBe(
      "0 0 32 32",
    );
    expect(ProviderIcon({ provider: "pi", displayName: "Takomi" })?.props.viewBox).toBe(
      "0 0 32 32",
    );
  });

  it("keeps stock Pi and Codex distinct and does not show Codex for an unknown provider", () => {
    expect(ProviderIcon({ provider: "pi", instanceId: "pi" })?.props.viewBox).toBe(
      "165.29 165.29 469.43 469.43",
    );
    expect(ProviderIcon({ provider: "codex" })?.props.viewBox).toBe("100 100 411 411");
    expect(ProviderIcon({ provider: undefined })).toBeNull();
  });
});

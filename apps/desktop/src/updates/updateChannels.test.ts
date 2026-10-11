import { describe, expect, it } from "vite-plus/test";

import {
  isNightlyDesktopVersion,
  normalizeTakomiDesktopUpdateChannel,
  resolveDefaultDesktopUpdateChannel,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("keeps Takomi desktop stable without changing upstream version classification", () => {
    expect(normalizeTakomiDesktopUpdateChannel("nightly")).toBe("latest");
    expect(normalizeTakomiDesktopUpdateChannel("latest")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.1.1")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7")).toBe("nightly");
  });

  it("keeps preview builds branded as nightly but on the latest update channel", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7")).toBe("nightly");
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });
});

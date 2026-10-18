import { describe, expect, it } from "vite-plus/test";
import {
  clientReleaseTarget,
  serverDistributionFromRepository,
  SERVER_DISTRIBUTIONS,
} from "./cliRelease.ts";

describe("server distribution", () => {
  it("recognizes only embedded repositories, not client branding or a matching version", () => {
    expect(
      serverDistributionFromRepository({ url: "https://github.com/JStaRFilms/Takomi-Code.git" }),
    ).toBe("takomi");
    expect(
      serverDistributionFromRepository({ url: "https://github.com/pingdotgg/t3code.git" }),
    ).toBe("t3");
    for (const value of [
      undefined,
      null,
      { name: "Takomi Code", version: "0.1.0" },
      { url: "https://example.test/takomi" },
      { url: "https://github.com/pingdotgg/t3code.git;evil" },
    ]) {
      expect(serverDistributionFromRepository(value)).toBeUndefined();
    }
    expect(SERVER_DISTRIBUTIONS.takomi.npmPackage).toBe("takomi-code");
    expect(SERVER_DISTRIBUTIONS.t3.npmPackage).toBe("t3");
  });
  it("never treats a fork version as a proven T3 release or accepts shell syntax", () => {
    expect(clientReleaseTarget("takomi", "0.1.0")).toBe("0.1.0");
    expect(clientReleaseTarget("t3", "0.1.0")).toBeNull();
    expect(clientReleaseTarget(undefined, "0.1.0")).toBeNull();
    for (const version of [
      "0.1.0;evil",
      "0.1.0-$(evil)",
      "latest",
      "0.1.0\n",
      "0.1.0 --registry=x",
    ]) {
      expect(clientReleaseTarget("takomi", version)).toBeNull();
    }
  });
});

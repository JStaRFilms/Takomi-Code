import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import { serverModelsFromPiModels } from "./PiProvider.ts";

describe("serverModelsFromPiModels", () => {
  it("maps discovered Pi models and their thinking levels", () => {
    const models = serverModelsFromPiModels([
      {
        provider: "openai-codex",
        id: "gpt-5.4",
        name: "GPT-5.4",
        reasoning: true,
        thinkingLevelMap: { xhigh: "xhigh", max: null },
      },
      {
        provider: "lmstudio",
        id: "gemma",
        name: "Gemma",
        reasoning: false,
      },
    ]);

    NodeAssert.equal(models[0]?.slug, "openai-codex/gpt-5.4");
    NodeAssert.equal(models[0]?.subProvider, "openai-codex");
    const thinking = models[0]?.capabilities?.optionDescriptors?.[0];
    NodeAssert.deepEqual(
      thinking?.type === "select" ? thinking.options.map((option) => option.id) : [],
      ["off", "minimal", "low", "medium", "high", "xhigh"],
    );
    NodeAssert.deepEqual(models[1]?.capabilities?.optionDescriptors, []);
  });
});

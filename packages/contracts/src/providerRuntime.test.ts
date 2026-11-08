import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { UserInputQuestion } from "./providerRuntime.ts";

const decodeQuestion = Schema.decodeSync(UserInputQuestion);

it("preserves private Pi input metadata without storing an answer", () => {
  const question = decodeQuestion({
    id: "archive",
    header: "Vault",
    question: "Choose an archive",
    options: [],
    sensitive: true,
    fileInput: "vault-archive",
  });
  expect(question).toMatchObject({ sensitive: true, fileInput: "vault-archive" });
  expect(question.initialAnswer).toBeUndefined();
});

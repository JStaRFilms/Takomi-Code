// @effect-diagnostics nodeBuiltinImport:off - executes the workflow script with mocked GitHub APIs.
import * as NodeVM from "node:vm";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { fromYaml } from "@t3tools/shared/schemaYaml";

const Job = Schema.Struct({
  if: Schema.optionalKey(Schema.String),
  needs: Schema.optionalKey(Schema.Array(Schema.String)),
  "runs-on": Schema.String,
  permissions: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  steps: Schema.Array(
    Schema.Struct({
      run: Schema.optionalKey(Schema.String),
      uses: Schema.optionalKey(Schema.String),
      env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
      with: Schema.optionalKey(
        Schema.Struct({
          script: Schema.optionalKey(Schema.String),
          "sparse-checkout": Schema.optionalKey(Schema.String),
          "sparse-checkout-cone-mode": Schema.optionalKey(Schema.Boolean),
        }),
      ),
    }),
  ),
});
const Workflow = Schema.Struct({
  on: Schema.Struct({
    push: Schema.Struct({
      branches: Schema.Array(Schema.String),
      tags: Schema.Array(Schema.String),
    }),
    workflow_dispatch: Schema.Struct({
      inputs: Schema.Struct({ publish: Schema.Struct({ default: Schema.Boolean }) }),
    }),
  }),
  permissions: Schema.Record(Schema.String, Schema.String),
  jobs: Schema.Record(Schema.String, Job),
});

const sourceCommit = "a".repeat(40);
const otherCommit = "b".repeat(40);
const tagCases: Array<{
  name: string;
  ref?: { type: "commit" | "tag"; sha: string };
  tagCommit?: string;
  refStatus?: number;
  tagStatus?: number;
  rejects?: string;
}> = [
  { name: "absent tag" },
  { name: "matching lightweight tag", ref: { type: "commit", sha: sourceCommit } },
  {
    name: "matching annotated tag",
    ref: { type: "tag", sha: "c".repeat(40) },
    tagCommit: sourceCommit,
  },
  {
    name: "mismatched lightweight tag",
    ref: { type: "commit", sha: otherCommit },
    rejects: "does not point to source commit",
  },
  {
    name: "mismatched annotated tag",
    ref: { type: "tag", sha: "c".repeat(40) },
    tagCommit: otherCommit,
    rejects: "does not point to source commit",
  },
  {
    name: "abbreviated source commit",
    ref: { type: "commit", sha: sourceCommit.slice(0, 7) },
    rejects: "does not point to source commit",
  },
  { name: "ref API failure", refStatus: 403, rejects: "ref lookup failed" },
  {
    name: "annotated tag API failure",
    ref: { type: "tag", sha: "c".repeat(40) },
    tagStatus: 404,
    rejects: "tag lookup failed",
  },
];

it.layer(NodeServices.layer)("Takomi release safety", (it) => {
  it.effect.each(tagCases)("validates $name before enabling publication", (testCase) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const source = yield* fs.readFileString(
        yield* path.fromFileUrl(
          new URL("../.github/workflows/takomi-release.yml", import.meta.url),
        ),
      );
      const workflow = yield* Schema.decodeEffect(fromYaml(Workflow))(source);
      const script = workflow.jobs.prepare?.steps.find(
        (step) => step.uses === "actions/github-script@v8",
      )?.with?.script;
      assert.isString(script);
      const outputs: Record<string, string> = {};
      let refLookups = 0;
      let tagLookups = 0;
      yield* Effect.promise(async () => {
        const prepared: unknown = NodeVM.runInNewContext(`(async () => {\n${script}\n})()`, {
          context: {
            eventName: "workflow_dispatch",
            ref: "refs/heads/Takomi-Code",
            sha: sourceCommit,
            repo: { owner: "JStaRFilms", repo: "Takomi-Code" },
          },
          process: { env: { INPUT_VERSION: "1.2.3", INPUT_PUBLISH: "true" } },
          core: {
            setOutput: (name: string, value: string) => {
              outputs[name] = value;
            },
          },
          github: {
            rest: {
              git: {
                getRef: async (input: { owner: string; repo: string; ref: string }) => {
                  refLookups++;
                  assert.equal(input.owner, "JStaRFilms");
                  assert.equal(input.repo, "Takomi-Code");
                  assert.equal(input.ref, "tags/v1.2.3");
                  if (testCase.refStatus || !testCase.ref) {
                    throw Object.assign(new Error("ref lookup failed"), {
                      status: testCase.refStatus ?? 404,
                    });
                  }
                  return { data: { object: testCase.ref } };
                },
                getTag: async (input: { owner: string; repo: string; tag_sha: string }) => {
                  tagLookups++;
                  assert.equal(input.owner, "JStaRFilms");
                  assert.equal(input.repo, "Takomi-Code");
                  assert.equal(input.tag_sha, testCase.ref?.sha);
                  if (testCase.tagStatus) {
                    throw Object.assign(new Error("tag lookup failed"), {
                      status: testCase.tagStatus,
                    });
                  }
                  return { data: { object: { type: "commit", sha: testCase.tagCommit } } };
                },
              },
            },
          },
        });
        if (testCase.rejects) {
          await expect(prepared).rejects.toThrow(testCase.rejects);
          assert.deepStrictEqual(outputs, {});
        } else {
          await prepared;
          assert.deepStrictEqual(outputs, { version: "1.2.3", publish: "true" });
        }
      });
      assert.equal(refLookups, 1);
      assert.equal(tagLookups, testCase.ref?.type === "tag" ? 1 : 0);
    }),
  );
  it.effect(
    "keeps pushes build-only and publication fork-owned, ordered and least-privileged",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const source = yield* fs.readFileString(
          yield* path.fromFileUrl(
            new URL("../.github/workflows/takomi-release.yml", import.meta.url),
          ),
        );
        const workflow = yield* Schema.decodeEffect(fromYaml(Workflow))(source);
        assert.deepStrictEqual(workflow.on.push.branches, ["Takomi-Code"]);
        assert.deepStrictEqual(workflow.on.push.tags, ["v*.*.*"]);
        assert.isFalse(workflow.on.workflow_dispatch.inputs.publish.default);
        assert.deepStrictEqual(workflow.permissions, { contents: "read" });
        assert.equal(workflow.jobs.prepare?.if, "github.repository == 'JStaRFilms/Takomi-Code'");
        const checkoutJobs: string[] = [];
        for (const [name, job] of Object.entries(workflow.jobs)) {
          for (const step of job.steps) {
            if (!step.uses?.startsWith("actions/checkout@")) continue;
            checkoutJobs.push(name);
            assert.equal(step.with?.["sparse-checkout"], "/*\n!/.repos/\n");
            assert.isFalse(step.with?.["sparse-checkout-cone-mode"]);
          }
          if (name === "npm" || name === "github_release") {
            assert.equal(job.if, "needs.prepare.outputs.publish == 'true'");
          } else {
            assert.isUndefined(job.permissions);
          }
          assert.oneOf(job["runs-on"], ["ubuntu-24.04", "windows-2025", "${{ matrix.runner }}"]);
        }
        assert.deepStrictEqual(checkoutJobs, ["prepare", "bundle", "cli", "windows", "npm"]);
        assert.deepStrictEqual(workflow.jobs.npm?.permissions, {
          contents: "read",
          "id-token": "write",
        });
        assert.deepStrictEqual(workflow.jobs.github_release?.permissions, { contents: "write" });
        assert.include(workflow.jobs.github_release?.needs ?? [], "npm");
        assert.include(workflow.jobs.windows?.needs ?? [], "cli");
        for (const name of ["bundle", "cli", "windows", "npm", "github_release"]) {
          assert.include(workflow.jobs[name]?.needs ?? [], "prepare");
        }
        const publishRuns =
          workflow.jobs.npm?.steps.flatMap((step) => (step.run ? [step.run] : [])) ?? [];
        assert.include(publishRuns.at(-2) ?? "", "--dry-run");
        assert.notInclude(publishRuns.at(-1) ?? "", "--dry-run");
        assert.include(
          source,
          "context.eventName === 'workflow_dispatch' && process.env.INPUT_PUBLISH === 'true'",
        );
        assert.include(
          source,
          "publish ? requested : `${base}-preview.${date}.${context.runNumber}`",
        );
        assert.include(source, 'test -f "release-cli/t3-${VERSION}-linux-x64.tar.gz"');
        assert.include(source, 'test -f "release-cli/t3-${VERSION}-win32-x64.zip"');
        assert.include(source, '--wsl-runtime "wsl-runtime/t3-${VERSION}-linux-x64.tar.gz"');
        assert.include(source, "T3CODE_DESKTOP_UPDATE_REPOSITORY: JStaRFilms/Takomi-Code");
        assert.include(source, "--repo JStaRFilms/Takomi-Code");
        for (const forbidden of [
          "secrets.",
          "secrets: inherit",
          "blacksmith",
          "vercel",
          "release-desktop.yml",
          "pingdotgg",
          "@t3code",
          "NPM_TOKEN",
          "schedule:",
        ]) {
          assert.notInclude(source, forbidden);
        }
        const upstream = yield* fs.readFileString(
          yield* path.fromFileUrl(new URL("../.github/workflows/release.yml", import.meta.url)),
        );
        assert.include(
          upstream,
          "resolve_commit:\n    if: github.repository == 'pingdotgg/t3code'",
        );
      }),
  );
});

// @effect-diagnostics nodeBuiltinImport:off -- Temporary fixture setup uses Node's synchronous test helpers.
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it } from "@effect/vitest";

import * as Effect from "effect/Effect";

import {
  discoverPiProjectTrust,
  enrichPiDiscoveredResources,
  expandPiSkillReferences,
  MAX_PI_RESOURCE_FILE_BYTES,
  parsePiDiscoveredResources,
  parsePiProjectTrustOverride,
  piResourceFingerprint,
} from "./PiResources.ts";

function withTempDirectory<A, E, R>(
  use: (directory: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pi-resources-"))),
    use,
    (directory) => Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true })),
  );
}

describe("Pi resource discovery", () => {
  it("keeps RPC-invocable resources, preserves first-wins order, and redacts host paths", () => {
    const resources = parsePiDiscoveredResources({
      commands: [
        { name: "tui-only", description: "Must not be exposed", source: "builtin" },
        {
          name: "review",
          description: "Project review",
          source: "prompt",
          sourceInfo: {
            path: "/remote/workspace/.pi/prompts/review.md",
            source: "auto",
            scope: "project",
            origin: "/remote/workspace",
            baseDir: "/remote/workspace",
          },
        },
        {
          name: "review",
          description: "Later global copy",
          source: "prompt",
          sourceInfo: { scope: "user" },
        },
        {
          name: "ship",
          description: "Extension command",
          source: "extension",
          sourceInfo: {
            path: "/remote/extensions/team.ts",
            source: "npm:@takomi/team-tools",
            scope: "user",
            origin: "package",
          },
        },
        {
          name: "skill:deploy",
          description: "Deploy safely",
          source: "skill",
          sourceInfo: { path: "/remote/.agents/skills/deploy/SKILL.md", scope: "user" },
        },
        { name: "skill:deploy", description: "Later skill", source: "skill" },
      ],
    });

    NodeAssert.deepEqual(
      resources.slashCommands.map((command) => command.name),
      ["review", "ship"],
    );
    NodeAssert.match(resources.slashCommands[0]?.sourceInfo?.path ?? "", /^pi-resource:/);
    NodeAssert.deepEqual(resources.slashCommands[0]?.sourceInfo, {
      path: resources.slashCommands[0]?.sourceInfo?.path,
      source: "auto",
      scope: "project",
    });
    NodeAssert.equal(resources.slashCommands[1]?.sourceInfo?.source, "npm:@takomi/team-tools");
    NodeAssert.equal(resources.skills.length, 1);
    NodeAssert.match(resources.skills[0]?.path ?? "", /^pi-resource:/);
    NodeAssert.equal(resources.skills[0]?.scope, "user");
    NodeAssert.doesNotMatch(
      JSON.stringify({ slashCommands: resources.slashCommands, skills: resources.skills }),
      /\/remote/,
    );
    NodeAssert.deepEqual(
      resources.resourceFiles.map((resource) => resource.hostPath),
      [
        "/remote/workspace/.pi/prompts/review.md",
        "/remote/extensions/team.ts",
        "/remote/.agents/skills/deploy/SKILL.md",
      ],
    );
  });

  it("keeps bounded inline provenance without replacing it with command classification", () => {
    const resources = parsePiDiscoveredResources({
      commands: [
        { name: "inline-prompt", source: "prompt", sourceInfo: { source: "inline" } },
        {
          name: "unsafe-source",
          source: "extension",
          sourceInfo: { source: "file:/remote/extension.ts" },
        },
      ],
    });
    NodeAssert.equal(resources.slashCommands[0]?.sourceInfo?.source, "inline");
    NodeAssert.equal(resources.slashCommands[1]?.sourceInfo?.source, undefined);
  });

  it("caps the number of RPC resources processed", () => {
    const resources = parsePiDiscoveredResources({
      commands: Array.from({ length: 300 }, (_, index) => ({
        name: `command-${index}`,
        source: "extension",
      })),
    });
    NodeAssert.equal(resources.slashCommands.length, 256);
    NodeAssert.equal(resources.slashCommands.at(-1)?.name, "command-255");
  });

  it("uses Pi's native skill invocation instead of sending picker syntax verbatim", () => {
    NodeAssert.equal(
      expandPiSkillReferences(
        "Use $release then $release; leave $HOME alone",
        new Set(["release"]),
      ),
      "/skill:release Use then $release; leave $HOME alone",
    );
    NodeAssert.equal(
      expandPiSkillReferences("$release with notes", new Set(["release"])),
      "/skill:release with notes",
    );
  });

  it("changes the host-only cache fingerprint for config and resource changes", () => {
    const resources = parsePiDiscoveredResources({
      commands: [{ name: "review", description: "One", source: "prompt" }],
    });
    const changed = parsePiDiscoveredResources({
      commands: [{ name: "review", description: "Two", source: "prompt" }],
    });
    NodeAssert.notEqual(
      piResourceFingerprint({ settings: "one", resources }),
      piResourceFingerprint({ settings: "two", resources }),
    );
    NodeAssert.notEqual(
      piResourceFingerprint({ settings: "one", resources }),
      piResourceFingerprint({ settings: "one", resources: changed }),
    );
  });

  it("matches Pi's last explicit approve/no-approve flag", () => {
    NodeAssert.equal(parsePiProjectTrustOverride(["--approve"]), true);
    NodeAssert.equal(parsePiProjectTrustOverride(["-a", "--no-approve"]), false);
    NodeAssert.equal(parsePiProjectTrustOverride(["-na", "--approve"]), true);
    NodeAssert.equal(parsePiProjectTrustOverride(["--approve", "--", "--no-approve"]), true);
    NodeAssert.equal(parsePiProjectTrustOverride(["--", "--approve"]), undefined);
    NodeAssert.equal(parsePiProjectTrustOverride([]), undefined);
  });

  it.layer(NodeServices.layer)("Pi resource metadata", (it) => {
    it.effect("reads prompt and exact Pi skill frontmatter from environment-owned files", () =>
      withTempDirectory((directory) =>
        Effect.gen(function* () {
          const promptPath = NodePath.join(directory, "pr.md");
          const skillPath = NodePath.join(directory, "release.md");
          const stringFlagPath = NodePath.join(directory, "string-flag.md");
          NodeFS.writeFileSync(promptPath, "---\nargument-hint: <PR-URL>\n---\nPrompt");
          NodeFS.writeFileSync(
            skillPath,
            "---\ndescription: Release the project\ndisable-model-invocation: true\nuser-invocable: false\n---\nSkill",
          );
          NodeFS.writeFileSync(stringFlagPath, '---\ndisable-model-invocation: "true"\n---\nSkill');
          const resources = parsePiDiscoveredResources({
            commands: [
              {
                name: "pr",
                source: "prompt",
                sourceInfo: { path: promptPath, source: "prompt" },
              },
              {
                name: "skill:release",
                source: "skill",
                sourceInfo: { path: skillPath, scope: "project" },
              },
              {
                name: "skill:string-flag",
                source: "skill",
                sourceInfo: { path: stringFlagPath, scope: "project" },
              },
            ],
          });
          const enriched = yield* enrichPiDiscoveredResources(resources);

          NodeAssert.deepEqual(enriched.slashCommands[0]?.input, { hint: "<PR-URL>" });
          NodeAssert.equal(enriched.skills[0]?.description, "Release the project");
          NodeAssert.equal(enriched.skills[0]?.userInvocationOnly, true);
          NodeAssert.equal(enriched.skills[0]?.userInvocable, undefined);
          NodeAssert.equal(enriched.skills[1]?.userInvocationOnly, undefined);
        }),
      ),
    );

    it.effect("ignores malformed and oversized metadata without dropping RPC resources", () =>
      withTempDirectory((directory) =>
        Effect.gen(function* () {
          const malformedPath = NodePath.join(directory, "malformed.md");
          const oversizedPath = NodePath.join(directory, "oversized.md");
          NodeFS.writeFileSync(malformedPath, "---\n[not yaml\n---\nPrompt");
          NodeFS.writeFileSync(
            oversizedPath,
            `---\nargument-hint: leaked\n---\n${"x".repeat(MAX_PI_RESOURCE_FILE_BYTES)}`,
          );
          const resources = parsePiDiscoveredResources({
            commands: [
              { name: "malformed", source: "prompt", sourceInfo: { path: malformedPath } },
              { name: "oversized", source: "prompt", sourceInfo: { path: oversizedPath } },
            ],
          });
          const enriched = yield* enrichPiDiscoveredResources(resources);
          NodeAssert.deepEqual(
            enriched.slashCommands.map((command) => ({ name: command.name, input: command.input })),
            [
              { name: "malformed", input: undefined },
              { name: "oversized", input: undefined },
            ],
          );
        }),
      ),
    );

    it.effect("reports explicit and observable trust separately from partial configuration", () =>
      withTempDirectory((directory) =>
        Effect.gen(function* () {
          const agentDirectory = NodePath.join(directory, "agent");
          const projectRoot = NodePath.join(directory, "workspace");
          const child = NodePath.join(projectRoot, "child");
          NodeFS.mkdirSync(agentDirectory, { recursive: true });
          NodeFS.mkdirSync(child, { recursive: true });
          NodeFS.writeFileSync(
            NodePath.join(agentDirectory, "trust.json"),
            // @effect-diagnostics-next-line preferSchemaOverJson:off -- Trusted test-only values.
            JSON.stringify({ [projectRoot]: true, [child]: false }),
          );
          NodeFS.writeFileSync(
            NodePath.join(agentDirectory, "settings.json"),
            // @effect-diagnostics-next-line preferSchemaOverJson:off -- Trusted test-only values.
            JSON.stringify({ defaultProjectTrust: "always" }),
          );
          const trustFor = (overrides?: {
            readonly launchArgs?: ReadonlyArray<string>;
            readonly observedProjectResources?: boolean;
          }) =>
            discoverPiProjectTrust({
              homePath: agentDirectory,
              cwd: child,
              environment: {},
              launchArgs: overrides?.launchArgs ?? [],
              observedProjectResources: overrides?.observedProjectResources ?? false,
            });

          NodeAssert.equal(yield* trustFor(), "configured-saved-rejected-partial");
          NodeAssert.equal(
            yield* trustFor({ observedProjectResources: true }),
            "observed-project-resources",
          );
          NodeAssert.equal(
            yield* trustFor({ launchArgs: ["--approve", "--no-approve"] }),
            "explicit-rejected",
          );
          NodeFS.writeFileSync(NodePath.join(agentDirectory, "trust.json"), "{}");
          NodeAssert.equal(yield* trustFor(), "configured-default-always-partial");
          NodeFS.writeFileSync(NodePath.join(agentDirectory, "settings.json"), "{bad json");
          NodeAssert.equal(yield* trustFor(), "unknown");
        }),
      ),
    );
  });
});

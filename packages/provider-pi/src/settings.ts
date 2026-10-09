/**
 * Pi instance settings. Shared by the server driver and the client settings
 * form, so it holds only browser-safe schema code.
 *
 * @module provider-pi/settings
 */
import {
  CustomModelSetting,
  makeBinaryPathSetting,
  makeProviderSettingsSchema,
  TrimmedString,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const PiSettings = makeProviderSettingsSchema(
  {
    // Off by default like Cursor and Grok. Users opt in from Settings.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("pi").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Pi coding agent binary.",
        providerSettingsForm: { placeholder: "pi", clearWhenEmpty: "omit" },
      }),
    ),
    homePath: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Agent directory",
        description:
          "Custom PI_CODING_AGENT_DIR containing settings, credentials, extensions, prompts, and themes.",
        providerSettingsForm: { placeholder: "~/.pi/agent", clearWhenEmpty: "omit" },
      }),
    ),
    suiteRoot: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Runtime suite root",
        description:
          "Optional runtime suite checkout loaded by the Pi process for extensions, subagents, and prompt templates.",
        providerSettingsForm: {
          placeholder: "/path/to/runtime-suite",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    launchArgs: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Launch arguments",
        description: "Additional CLI arguments passed to pi --mode rpc on session start.",
        providerSettingsForm: { clearWhenEmpty: "omit" },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "homePath", "suiteRoot", "launchArgs"],
  },
);
export type PiSettings = typeof PiSettings.Type;

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

/**
 * Finish all platform uploads before publishing the launcher; skip it if any upload fails.
 * Do not interrupt other uploads: npm rejects version reuse even after partially completed publication.
 */
export const publishPlatformsThenLauncher = Effect.fn("publishPlatformsThenLauncher")(function* <
  E,
  R,
>(input: {
  readonly platformTarballs: ReadonlyArray<string>;
  readonly launcherTarball: string;
  readonly publish: (tarball: string) => Effect.Effect<void, E, R>;
}) {
  const results = yield* Effect.all(input.platformTarballs.map(input.publish), {
    concurrency: "unbounded",
    mode: "result",
  });
  const failed = results.find(Result.isFailure);
  if (failed) {
    return yield* Effect.fail(failed.failure);
  }
  yield* input.publish(input.launcherTarball);
});

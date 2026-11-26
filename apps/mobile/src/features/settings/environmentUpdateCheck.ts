import { errorDisplayMessage } from "@t3tools/client-runtime/errors";
import type { EnvironmentId, ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";
import { msg } from "gt-react-native";

import { m } from "../../i18n/messages";
import { findEnvironmentUpdate } from "./environment-maintenance";

export interface EnvironmentReleaseCheck {
  readonly fromVersion: string;
  readonly targetVersion: string | null;
  readonly distribution: ExecutionEnvironmentDescriptor["distribution"];
}

export function outdatedServerUpdateTarget(release: EnvironmentReleaseCheck | null): string | null {
  // The protocol-gated update path accepts only Takomi hosts.
  return release?.distribution === "takomi" ? release.targetVersion : null;
}

export class EnvironmentUpdateCheckError extends Schema.TaggedError<EnvironmentUpdateCheckError>()(
  "EnvironmentUpdateCheckError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const asError = (cause: unknown) =>
  new EnvironmentUpdateCheckError({
    message:
      cause instanceof Error
        ? (errorDisplayMessage(cause, m) ?? cause.message)
        : m(msg("Could not check for updates.")),
    cause,
  });

/**
 * Looks up a release from the described server distribution. The atom is not
 * kept alive, so leaving the screen interrupts the lookup and aborts its fetch.
 * The argument reads the server version, which an outdated server only
 * reports through a separate description request.
 */
export const environmentReleaseCheckAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.fn(
    (
      readServer: () => Promise<
        Pick<ExecutionEnvironmentDescriptor, "serverVersion" | "distribution">
      >,
    ) =>
      Effect.gen(function* () {
        const server = yield* Effect.tryPromise({ try: readServer, catch: asError });
        const fromVersion = server.serverVersion;
        const targetVersion = yield* Effect.tryPromise({
          try: (signal) => findEnvironmentUpdate(fromVersion, signal, server.distribution),
          catch: asError,
        }).pipe(
          Effect.timeoutOrElse({
            duration: "20 seconds",
            orElse: () =>
              Effect.fail(
                new EnvironmentUpdateCheckError({
                  message: m(msg("Checking for updates timed out. Try again.")),
                }),
              ),
          }),
        );
        return {
          fromVersion,
          targetVersion,
          distribution: server.distribution,
        } satisfies EnvironmentReleaseCheck;
      }),
  ).pipe(Atom.withLabel(`mobile:environment-release-check:${environmentId}`)),
);

export function releaseCheckValue(
  result: AsyncResult.AsyncResult<EnvironmentReleaseCheck, Error>,
): EnvironmentReleaseCheck | null {
  return AsyncResult.getOrElse(result, () => null);
}

export function releaseCheckError(
  result: AsyncResult.AsyncResult<EnvironmentReleaseCheck, Error>,
): string | null {
  if (!AsyncResult.isFailure(result) || result.waiting) return null;
  return Option.getOrNull(AsyncResult.error(result))?.message ?? null;
}

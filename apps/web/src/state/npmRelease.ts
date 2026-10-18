import type { ServerDistribution } from "@t3tools/contracts";
import { SERVER_DISTRIBUTIONS } from "@t3tools/shared/cliRelease";
import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { AsyncResult, Atom } from "effect/reactivity";

export const npmReleasePublishedAtom = Atom.family((distribution: ServerDistribution) =>
  Atom.family((version: string) =>
    Atom.make(
      Effect.gen(function* () {
        const response = yield* HttpClient.get(
          `https://registry.npmjs.org/${SERVER_DISTRIBUTIONS[distribution].npmPackage}/${encodeURIComponent(version)}`,
        );
        if (response.status === 404) return false;
        const body = yield* HttpClientResponse.filterStatusOk(response).pipe(
          Effect.flatMap((ok) => ok.json),
        );
        return typeof body === "object" && body !== null && "version" in body
          ? body.version === version
          : false;
      }).pipe(
        // Tracing headers would make the browser send a CORS preflight, which npm rejects.
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.provide(FetchHttpClient.layer),
      ),
    ).pipe(
      Atom.withRefresh("5 minutes"),
      Atom.keepAlive,
      Atom.withLabel(`npm-release-published:${distribution}:${version}`),
    ),
  ),
);

const NO_VERSION_ATOM = Atom.make(AsyncResult.success(false)).pipe(
  Atom.withLabel("npm-release-published:none"),
);

export function useNpmReleasePublished(
  version: string | null,
  distribution: ServerDistribution,
): boolean {
  const result = useAtomValue(
    version ? npmReleasePublishedAtom(distribution)(version) : NO_VERSION_ATOM,
  );
  return AsyncResult.getOrElse(result, () => false);
}

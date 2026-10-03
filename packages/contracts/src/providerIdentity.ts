/**
 * The Pi provider's user-facing identity, shared by server and clients.
 *
 * `driverKind` is stable wire state and stays `pi` everywhere. `displayName`
 * is branding: this fork labels the provider "Takomi"; a stock build flips
 * this one line to "Pi" and every provider surface follows.
 */
export const PI_PROVIDER_IDENTITY = {
  driverKind: "pi",
  displayName: "Takomi",
} as const;

/** Takomi and stock Pi are separate instances of the same Pi RPC driver. */
export const PI_PROVIDER_IDENTITY = {
  driverKind: "pi",
  displayName: "Pi",
} as const;

export const TAKOMI_PROVIDER_IDENTITY = {
  instanceId: "takomi",
  displayName: "Takomi",
} as const;

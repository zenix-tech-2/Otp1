// Client-safe definitions for free, public temporary numbers. Customers only see "Number V1…".
export const NUMBER_PROVIDERS = ["v1", "v2"] as const;
export type NumberProviderId = (typeof NUMBER_PROVIDERS)[number];
export const numberProviderLabel = (id: string) => `Number ${id.toUpperCase()}`;
export type NumberProviderOption = { id: NumberProviderId; label: string };
export type FreeCountry = { id: string; name: string };
export type FreeNumber = { number: string; local: string; country: string; ago: string; archived: boolean };
export type FreeMessage = { id: string; from: string; text: string; ago: string; code: string | null };

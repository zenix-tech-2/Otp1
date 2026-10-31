// Client-safe copy of the rental duration label (numberotp.ts is server-only).
export function rentLabel(hours: number) { return hours < 24 ? `${hours} hours` : hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hours`; }

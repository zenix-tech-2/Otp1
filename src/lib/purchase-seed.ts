// Remembers what the server just returned for a purchase, so the next screen can show it instantly
// instead of waiting for a second round trip. The page still refreshes the real status in the background.
const seeds = new Map<string, unknown>();
export function seedPurchase(kind: "activation" | "rental", item: { id: string }) { seeds.set(`${kind}:${item.id}`, item); if (seeds.size > 20) seeds.delete(seeds.keys().next().value as string); }
export function peekPurchase<T>(kind: "activation" | "rental", id: string): T | null { return (seeds.get(`${kind}:${id}`) as T | undefined) ?? null; }

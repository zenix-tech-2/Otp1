// Client-safe coupon helpers. Money is USD cents (catalog currency); the checkout converts the final price to the wallet currency.
export type CouponKind = "percent" | "fixed";
export type CouponRule = { type: string; value: number; maxDiscount?: number | null };
export function normalizeCouponCode(input: unknown): string { return typeof input === "string" ? input.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) : ""; }
/** Discount in USD cents for a subtotal in USD cents. Never more than the subtotal, never negative. */
export function couponDiscount(rule: CouponRule, subtotal: number): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  let amount = rule.type === "fixed" ? Math.floor(rule.value) : Math.floor(subtotal * Math.min(100, Math.max(0, rule.value)) / 100);
  if (rule.maxDiscount != null && rule.maxDiscount > 0) amount = Math.min(amount, rule.maxDiscount);
  return Math.max(0, Math.min(amount, subtotal));
}
export function couponLabel(rule: CouponRule & { minSubtotal?: number }, formatUsd: (cents: number) => string): string {
  const base = rule.type === "fixed" ? `${formatUsd(rule.value)} off` : `${rule.value}% off`;
  return rule.maxDiscount ? `${base} (up to ${formatUsd(rule.maxDiscount)})` : base;
}
export type CouponQuote = { code: string; description: string; discount: number; total: number; label: string };

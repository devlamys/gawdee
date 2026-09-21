/** Loyalty money is represented in whole paise. One coin is exactly one paise. */
export function formatPaise(paise: number): string {
  if (!Number.isSafeInteger(paise)) return '₹0.00';
  const sign = paise < 0 ? '−' : '';
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100).toLocaleString('en-IN');
  const remainder = (absolute % 100).toString().padStart(2, '0');
  return `${sign}₹${rupees}.${remainder}`;
}

export function formatCoins(coins: number): string {
  return Number.isSafeInteger(coins) ? coins.toLocaleString('en-IN') : '0';
}

/** Orders created before paise snapshots may still contain the pre-coin rupee total. */
export function formatOrderTotal(order: {
  total: number;
  total_paise?: number;
  subtotal_paise?: number;
  shipping_paise?: number;
  loyalty_discount_paise?: number;
}): string {
  const snapshot = order.total_paise;
  if (Number.isSafeInteger(snapshot) && ((snapshot ?? 0) > 0 ||
    (order.subtotal_paise ?? 0) > 0 || (order.shipping_paise ?? 0) > 0)) {
    return formatPaise(snapshot as number);
  }
  return formatPaise(Math.max(0, order.total * 100 - (order.loyalty_discount_paise ?? 0)));
}

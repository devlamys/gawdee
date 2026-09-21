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

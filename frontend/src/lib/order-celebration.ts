const CELEBRATION_KEY = 'gawdee:order-celebration:v1';

/** Only checkout marks a successfully placed order for a one-time celebration. */
export function markOrderForCelebration(orderNumber: string): void {
  try {
    sessionStorage.setItem(CELEBRATION_KEY, orderNumber);
  } catch {
    // Checkout still succeeds if browser storage is unavailable.
  }
}

export function consumeOrderCelebration(orderNumber: string): boolean {
  try {
    if (sessionStorage.getItem(CELEBRATION_KEY) !== orderNumber) return false;
    sessionStorage.removeItem(CELEBRATION_KEY);
    return true;
  } catch {
    return false;
  }
}

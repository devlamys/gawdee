/**
 * Central environment configuration for the Gawdee storefront.
 *
 * RULE: this module is the ONLY place allowed to read `process.env`.
 * Components, hooks, pages and API clients must `import { env } from '@/config/env'`
 * and never touch `process.env` directly.
 *
 * Browser-exposed values MUST use the NEXT_PUBLIC_ prefix (inlined at build time).
 * Server-only values (INTERNAL_API_URL, CRON_SECRET, …) have no prefix and never
 * ship to the browser.
 */

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  /** Server-side backend base URL (SSR / route handlers only — never exposed to the browser). */
  internalApiUrl: str('INTERNAL_API_URL', 'http://127.0.0.1:8001/api'),

  /** Browser API base URL (proxied to the backend by next.config.ts rewrites). */
  publicApiUrl: str('NEXT_PUBLIC_API_URL', '/api'),

  /** Razorpay checkout.js script URL. */
  razorpayCheckoutUrl: str(
    'NEXT_PUBLIC_RAZORPAY_CHECKOUT_URL',
    'https://checkout.razorpay.com/v1/checkout.js'
  ),

  /** Third-party animation/effects scripts loaded in the root layout. */
  lottieUrl: str(
    'NEXT_PUBLIC_LOTTIE_URL',
    'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js'
  ),
  confettiUrl: str(
    'NEXT_PUBLIC_CONFETTI_URL',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
  ),

  /** ISO-4217 currency code used by `money()` formatting. */
  currency: str('NEXT_PUBLIC_CURRENCY', 'INR'),

  /** Fallback shipping/offer rules used only until backend `/storefront` settings load. */
  defaultShippingThreshold: num('NEXT_PUBLIC_DEFAULT_SHIPPING_THRESHOLD', 999),
  defaultShippingFee: num('NEXT_PUBLIC_DEFAULT_SHIPPING_FEE', 99),

  /** Fallback storefront identity used only until backend `/storefront` settings load. */
  defaults: {
    brandName: str('NEXT_PUBLIC_DEFAULT_BRAND_NAME', 'Gawdee'),
    brandTagline: str('NEXT_PUBLIC_DEFAULT_BRAND_TAGLINE', 'Pure food, thoughtfully made.'),
    brandLogo: str('NEXT_PUBLIC_DEFAULT_BRAND_LOGO', '/assets/images/logo.png'),
    storeEmail: str('NEXT_PUBLIC_DEFAULT_STORE_EMAIL', 'info@gawdee.com'),
    whatsappNumber: str('NEXT_PUBLIC_DEFAULT_WHATSAPP_NUMBER', '917055207030'),
    headerShopLabel: str('NEXT_PUBLIC_DEFAULT_HEADER_SHOP_LABEL', 'Shop Now'),
    aiChatEnabled: str('NEXT_PUBLIC_DEFAULT_AI_CHAT_ENABLED', '1'),
    siteShowWhatsapp: str('NEXT_PUBLIC_DEFAULT_SITE_SHOW_WHATSAPP', '1'),
  },
} as const;

export type Env = typeof env;

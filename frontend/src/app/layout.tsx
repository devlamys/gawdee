import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from '@/context/Providers';
import { StorefrontShell } from '@/components/StorefrontShell';
import { api } from '@/lib/api';
import { env } from '@/config/env';
import { StorefrontSettings } from '@/types';

export const metadata: Metadata = {
  title: 'Gawdee — Authentic organic food for everyday wellness',
  description: 'Shop Gawdee A2 Gir cow ghee, raw honey, natural nutrition blends and traditional pantry essentials.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 0.86,
  maximumScale: 5,
  themeColor: '#009a84',
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let settings: StorefrontSettings = {
    brand_name: env.defaults.brandName,
    brand_tagline: env.defaults.brandTagline,
    brand_logo: env.defaults.brandLogo,
    free_shipping_threshold: String(env.defaultShippingThreshold),
    shipping_fee: String(env.defaultShippingFee),
    header_shop_label: env.defaults.headerShopLabel,
    ai_chat_enabled: env.defaults.aiChatEnabled,
    site_show_whatsapp: env.defaults.siteShowWhatsapp,
    whatsapp_number: env.defaults.whatsappNumber,
  };

  try {
    const storefrontData = await api.getStorefront();
    if (storefrontData?.ok && storefrontData.settings) {
      settings = { ...settings, ...storefrontData.settings };
    }
  } catch {
    // fallback to defaults if backend is momentarily unreachable
  }

  return (
    <html lang="en" className="js">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&family=Manrope:wght@600;700;800&family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css" />
      </head>
      <body className="commerce-home">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>
          <StorefrontShell settings={settings}>{children}</StorefrontShell>
        </Providers>
        <Script src={env.lottieUrl} strategy="lazyOnload" />
        <Script src={env.confettiUrl} strategy="lazyOnload" />
      </body>
    </html>
  );
}

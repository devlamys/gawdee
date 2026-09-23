'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { CartDrawer } from '@/components/CartDrawer';
import { AiChatDrawer } from '@/components/AiChatDrawer';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';
import { CheckoutStickyBar } from '@/components/CheckoutStickyBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { VariantsDrawer } from '@/components/VariantsDrawer';
import { ScrollReveal } from '@/components/ScrollReveal';
import { StorefrontSettings } from '@/types';

interface StorefrontShellProps {
  settings: StorefrontSettings;
  children: React.ReactNode;
}

export const StorefrontShell: React.FC<StorefrontShellProps> = ({ settings, children }) => {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <main id="admin-root">{children}</main>;
  }

  return (
    <>
      <ScrollReveal />
      <Header settings={settings} />
      <main id="main-content">{children}</main>
      <Footer settings={settings} />
      <CartDrawer />
      <CheckoutStickyBar />
      <MobileBottomNav />
      <VariantsDrawer />
      {settings.ai_chat_enabled !== '0' && <AiChatDrawer />}
      {settings.site_show_whatsapp !== '0' && (
        <WhatsAppFloat phone={settings.whatsapp_number} />
      )}
    </>
  );
};

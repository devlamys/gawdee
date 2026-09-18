import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';

const PAGE_TITLES: Record<string, string> = {
  shipping: 'Shipping & Delivery',
  returns: 'Returns & Refunds',
  contact: 'Contact Us',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
};

const DEFAULT_PAGE_CONTENT: Record<string, string> = {
  shipping: `We deliver pure, fresh food across India via express courier partners.

Orders are usually dispatched within 24 to 48 hours of confirmation.
Standard delivery takes 3 to 6 business days depending on your delivery pincode.
Orders above ₹999 qualify for Free Shipping. A standard delivery fee of ₹99 applies to smaller orders.
You will receive live tracking updates via WhatsApp and SMS upon dispatch.`,
  returns: `Because we make pure, perishable natural foods with no artificial preservatives, we accept returns on items that arrive damaged, leaking, or compromised during transit.

If you experience any quality or packaging issue:
1. Please notify our team within 48 hours of receiving your delivery.
2. Share a photo of the received parcel via WhatsApp or email.
3. We will promptly dispatch a fresh replacement or issue a full refund to your original payment method.`,
  contact: `We'd love to hear from you!

For questions about products, ingredients, traditional methods, or order support, reach out to our family team:
• Email: care@gawdee.com
• WhatsApp: +91 70552 07030
• Operating hours: Monday to Saturday, 9:00 AM – 7:00 PM IST`,
};

interface CMSPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CMSPage({ params }: CMSPageProps) {
  const { slug } = await params;
  const title = PAGE_TITLES[slug];

  if (!title) {
    notFound();
  }

  let content = DEFAULT_PAGE_CONTENT[slug] || '';
  let email = 'care@gawdee.com';
  let phone = '917055207030';

  try {
    const res = await api.getStorefront();
    if (res.ok && res.settings) {
      const dynamicKey = `page_${slug}` as keyof typeof res.settings;
      if (res.settings[dynamicKey]) {
        content = res.settings[dynamicKey] as string;
      }
      if (res.settings.store_email) email = res.settings.store_email;
      if (res.settings.whatsapp_number) phone = res.settings.whatsapp_number;
    }
  } catch {
    // fallback
  }

  const cleanPhone = phone.replace(/\D+/g, '');

  return (
    <section className="content-page" style={{ padding: '4rem 0 7rem' }}>
      <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <article className="content-page__article" style={{ background: '#fff', border: '1px solid #eee', borderRadius: '20px', padding: '3rem 2.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
          <Link className="sf-text-link" href="/" style={{ color: '#009a84', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
            <i className="ph ph-arrow-left"></i> Back to home
          </Link>

          <h1 style={{ fontSize: '2.4rem', marginBottom: '1.5rem', color: '#111' }}>{title}</h1>

          <div
            className="content-page__copy"
            style={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', whiteSpace: 'pre-line', marginBottom: '2.5rem' }}
          >
            {content}
          </div>

          <div
            className="content-page__contact"
            style={{ borderTop: '1px solid #eee', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
          >
            <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#111' }}>How can we help?</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '0.5rem' }}>
              <a className="sf-text-link" href={`mailto:${email}`} style={{ color: '#009a84', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="ph ph-envelope"></i> {email}
              </a>
              <a className="sf-text-link" href={`https://wa.me/${cleanPhone}`} target="_blank" rel="noopener" style={{ color: '#009a84', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="ph ph-whatsapp-logo"></i> WhatsApp Support
              </a>
              <Link className="sf-text-link" href="/account" style={{ color: '#009a84', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="ph ph-package"></i> View Your Orders
              </Link>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

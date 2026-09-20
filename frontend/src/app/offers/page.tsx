import React from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Offer } from '@/types';
import { resolveImageUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  let offers: Offer[] = [];

  try {
    const res = await api.getOffers();
    if (res?.ok && Array.isArray(res.offers)) {
      offers = res.offers;
    }
  } catch {
    offers = [];
  }

  return (
    <div style={{ padding: '3.5rem 0 6rem' }}>
      <div className="container">
        <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
            Hot deals
          </span>
          <h1 style={{ fontSize: '2.6rem', margin: '0.4rem 0', color: '#111' }}>Offers &amp; savings</h1>
          <p style={{ color: '#666', maxWidth: '620px', margin: '0.5rem auto 0', fontSize: '1.05rem' }}>
            Curated savings and product bundles for everyday wellness.
          </p>
        </header>

        {!offers.length ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#777' }}>
            <i className="ph ph-tag" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
            <h2 style={{ marginTop: '1rem' }}>No offers available.</h2>
            <p>Please check back soon for fresh deals.</p>
            <Link className="button button--primary" href="/products" style={{ marginTop: '1.2rem', display: 'inline-block' }}>
              Browse products <i className="ph ph-arrow-right"></i>
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {offers.map((offer) => {
              const href = offer.link_url || '/products';
              const image = resolveImageUrl(offer.image_url || '/assets/images/independence-day-offer-banner-v1.png');
              const card = (
                <>
                  <div style={{ position: 'relative', background: '#f8f5ef', padding: '1rem' }}>
                    <img
                      src={image}
                      alt={offer.title || 'Offer'}
                      loading="lazy"
                      style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '16px', display: 'block' }}
                    />
                    {offer.badge && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '1.8rem',
                          left: '1.8rem',
                          background: '#1d9f88',
                          color: '#fff',
                          padding: '0.42rem 0.7rem',
                          borderRadius: '999px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {offer.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '1.2rem' }}>
                    {offer.title && <h2 style={{ margin: '0 0 0.35rem', color: '#111', fontSize: '1.2rem' }}>{offer.title}</h2>}
                    {offer.subtitle && <p style={{ margin: '0 0 0.5rem', color: '#009a84', fontWeight: 700, fontSize: '0.82rem' }}>{offer.subtitle}</p>}
                    {offer.description && <p style={{ margin: 0, color: '#666', lineHeight: 1.6 }}>{offer.description}</p>}
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0a6a5a', fontWeight: 700 }}>
                        {offer.cta_label || 'Shop now'} <i className="ph ph-arrow-right" />
                      </span>
                    </div>
                  </div>
                </>
              );

              return (
                <article key={offer.id} style={{ background: '#fff', borderRadius: '18px', overflow: 'hidden', border: '1px solid #eee', boxShadow: '0 6px 22px rgba(0,0,0,0.04)' }}>
                  {href.startsWith('http') ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      {card}
                    </a>
                  ) : (
                    <Link href={href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      {card}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

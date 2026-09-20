'use client';

import Link from 'next/link';
import React from 'react';
import { resolveImageUrl } from '@/lib/utils';

export interface OfferCardItem {
  id: number;
  title?: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  image_url?: string;
  link_url?: string;
  cta_label?: string;
}

export function OfferCards({ offers }: { offers: OfferCardItem[] }) {
  if (!offers.length) return null;

  return (
    <section className="commerce-section" id="offers">
      <div className="container">
        <div className="commerce-section__heading reveal">
          <div>
            <span className="eyebrow">
              <i className="ph ph-tag"></i> Hot deals
            </span>
            <h2>Offers made for your daily rituals</h2>
            <p>Fresh savings and bundles curated for mindful family living.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
          {offers.map((offer) => {
            const image = resolveImageUrl(offer.image_url || '/assets/images/independence-day-offer-banner-v1.png');
            const href = offer.link_url || '/products';
            const card = (
              <>
                <div style={{ position: 'relative', padding: '1rem', background: '#f8f5ef', borderRadius: '18px 18px 0 0', minHeight: '220px' }}>
                  <img
                    src={image}
                    alt={offer.title || 'Offer'}
                    style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '14px', display: 'block' }}
                    loading="lazy"
                  />
                  {offer.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '1.5rem',
                        left: '1.5rem',
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
                <div style={{ padding: '1.2rem 1.2rem 1.4rem', background: '#fff', borderRadius: '0 0 18px 18px' }}>
                  {offer.title && <h3 style={{ margin: '0 0 0.45rem', color: '#111', fontSize: '1.2rem' }}>{offer.title}</h3>}
                  {offer.subtitle && <p style={{ margin: '0 0 0.5rem', color: '#009a84', fontWeight: 700, fontSize: '0.82rem' }}>{offer.subtitle}</p>}
                  {offer.description && <p style={{ margin: 0, color: '#666', fontSize: '0.92rem', lineHeight: 1.6 }}>{offer.description}</p>}
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
      </div>
    </section>
  );
}

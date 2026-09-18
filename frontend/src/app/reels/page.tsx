import React from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/utils';

export const revalidate = 120;

export default async function ReelsPage() {
  let media: Awaited<ReturnType<typeof api.getHomepageMedia>>['media'] = [];
  let videos: Awaited<ReturnType<typeof api.getVideoTestimonials>>['video_testimonials'] = [];

  try {
    const res = await api.getHomepageMedia('reels');
    if (res?.ok && Array.isArray(res.media)) media = res.media;
  } catch {
    media = [];
  }

  try {
    const res = await api.getVideoTestimonials();
    if (res?.ok && Array.isArray(res.video_testimonials)) videos = res.video_testimonials;
  } catch {
    videos = [];
  }

  const hasContent = media.length > 0 || videos.length > 0;

  return (
    <div style={{ padding: '3.5rem 0 6rem' }}>
      <div className="container">
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
            Watch &amp; Shop
          </span>
          <h1 style={{ fontSize: '2.6rem', margin: '0.4rem 0', color: '#111' }}>
            Reels &amp; Videos
          </h1>
          <p style={{ color: '#666', maxWidth: '600px', margin: '0.5rem auto 0', fontSize: '1.05rem' }}>
            Real glimpses of Gawdee purity — from our farms to your pantry.
          </p>
        </header>

        {!hasContent ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#777' }}>
            <i className="ph ph-film-strip" style={{ fontSize: '2.5rem', color: '#ccc' }}></i>
            <h2 style={{ marginTop: '1rem' }}>No reels available.</h2>
            <p>Please check back soon for fresh videos.</p>
            <Link className="button button--primary" href="/products" style={{ marginTop: '1.2rem', display: 'inline-block' }}>
              Browse Products <i className="ph ph-arrow-right"></i>
            </Link>
          </div>
        ) : (
          <>
            {media.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                {media.map((m) => {
                  const card = (
                    <>
                      {(m.file_path || m.poster_path) && (
                        <img
                          src={resolveImageUrl(m.file_path || m.poster_path)}
                          alt={m.alt_text || m.title || 'Gawdee reel'}
                          loading="lazy"
                          style={{ width: '100%', height: '320px', objectFit: 'cover' }}
                        />
                      )}
                      <div style={{ padding: '1.2rem' }}>
                        {m.title && <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.3rem', color: '#111' }}>{m.title}</h2>}
                        {m.subtitle && <p style={{ fontSize: '0.9rem', color: '#666', margin: 0 }}>{m.subtitle}</p>}
                      </div>
                    </>
                  );
                  return (
                    <article
                      key={m.id}
                      style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #eee', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}
                    >
                      {m.product_slug ? (
                        <Link href={`/products/${m.product_slug}`} style={{ display: 'block', color: 'inherit' }}>{card}</Link>
                      ) : (
                        card
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {videos.length > 0 && (
              <section>
                <h2 style={{ fontSize: '1.6rem', marginBottom: '1.5rem', color: '#111' }}>Customer video stories</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
                  {videos.map((v) => (
                    <article
                      key={v.id}
                      style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #eee', padding: '1.5rem' }}
                    >
                      <strong style={{ display: 'block', marginBottom: '0.3rem' }}>{v.name}</strong>
                      {v.role_location && <small style={{ color: '#888' }}>{v.role_location}</small>}
                      {v.quote && <p style={{ color: '#555', fontSize: '0.95rem', marginTop: '0.6rem' }}>{v.quote}</p>}
                      {v.video_type === 'embed' && v.external_url ? (
                        <a href={v.external_url} target="_blank" rel="noopener" style={{ color: '#009a84', fontWeight: 600 }}>
                          Watch video <i className="ph ph-arrow-up-right"></i>
                        </a>
                      ) : v.video_path ? (
                        <video src={resolveImageUrl(v.video_path)} poster={v.poster_path ? resolveImageUrl(v.poster_path) : undefined} controls style={{ width: '100%', borderRadius: '12px', marginTop: '0.8rem' }} />
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

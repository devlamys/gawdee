import React from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BlogPost } from '@/types';
import { resolveImageUrl } from '@/lib/utils';

export const revalidate = 120;

export default async function BlogListingPage() {
  let posts: BlogPost[] = [];
  try {
    const res = await api.getBlog(20);
    if (res.ok && Array.isArray(res.posts)) {
      posts = res.posts;
    }
  } catch {
    // fallback
  }

  return (
    <div style={{ padding: '3.5rem 0 6rem' }}>
      <div className="container">
        <header style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <span style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
            The Gawdee Journal
          </span>
          <h1 style={{ fontSize: '2.6rem', margin: '0.4rem 0', color: '#111' }}>
            Stories of Tradition &amp; Nourishment
          </h1>
          <p style={{ color: '#666', maxWidth: '600px', margin: '0.5rem auto 0', fontSize: '1.05rem' }}>
            Insights, Ayurvedic wisdom, recipes, and honest stories from our partner farms.
          </p>
        </header>

        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#777' }}>
            <p>Articles are being prepared. Please check back soon!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.8rem' }}>
            {posts.map((post) => {
              const coverImage = post.featured_image || post.cover_image;
              return (
              <article
                key={post.id}
                style={{
                  background: '#fff',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {coverImage && (
                  <Link href={`/blog/${post.slug}`}>
                    <img
                      src={resolveImageUrl(coverImage)}
                      alt={post.title}
                      width={400}
                      height={240}
                      style={{ width: '100%', height: '220px', objectFit: 'cover' }}
                    />
                  </Link>
                )}
                <div style={{ padding: '1.8rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    {post.category && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#009a84', textTransform: 'uppercase' }}>
                        {post.category}
                      </span>
                    )}
                    {post.published_at && (
                      <small style={{ color: '#888' }}>
                        {new Date(post.published_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </small>
                    )}
                  </div>

                  <h2 style={{ fontSize: '1.3rem', margin: '0.2rem 0 0.8rem', lineHeight: 1.3 }}>
                    <Link href={`/blog/${post.slug}`} style={{ color: '#111' }}>
                      {post.title}
                    </Link>
                  </h2>

                  <p style={{ fontSize: '0.95rem', color: '#666', lineHeight: 1.6, flex: 1, marginBottom: '1.2rem' }}>
                    {post.excerpt}
                  </p>

                  <Link className="sf-text-link" href={`/blog/${post.slug}`} style={{ color: '#009a84', fontWeight: 600 }}>
                    Read Full Story <i className="ph ph-arrow-right"></i>
                  </Link>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

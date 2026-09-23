import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/utils';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 120;

export default async function SingleBlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;

  let post = null;
  try {
    const res = await api.getBlogPost(slug);
    if (res.ok && res.post) {
      post = res.post;
    }
  } catch {
    // fallback
  }

  if (!post) {
    notFound();
  }

  const coverImage = post.featured_image || post.cover_image;
  const authorName = post.author || post.author_name;

  return (
    <article style={{ padding: '3.5rem 0 7rem' }}>
      <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Navigation back */}
        <Link href="/blog" style={{ color: '#009a84', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', marginBottom: '2rem' }}>
          <i className="ph ph-arrow-left"></i> Back to Journal
        </Link>

        <header style={{ marginBottom: '2.5rem' }}>
          {post.category && (
            <span style={{ color: '#009a84', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {post.category}
            </span>
          )}
          <h1 style={{ fontSize: '2.8rem', margin: '0.5rem 0 1rem', lineHeight: 1.2, color: '#111' }}>
            {post.title}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#777', fontSize: '0.9rem' }}>
            {authorName && <span>By <strong>{authorName}</strong></span>}
            {post.published_at && (
              <span>• {new Date(post.published_at).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            )}
          </div>
        </header>

        {coverImage && (
          <div style={{ marginBottom: '3rem', borderRadius: '16px', overflow: 'hidden' }}>
            <img
              src={resolveImageUrl(coverImage)}
              alt={post.title}
              width={800}
              height={450}
              style={{ width: '100%', height: 'auto', maxHeight: '450px', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Post content */}
        <div
          className="blog-content"
          style={{ fontSize: '1.1rem', lineHeight: 1.8, color: '#333' }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link className="button button--secondary" href="/blog">
            <i className="ph ph-arrow-left"></i> More Articles
          </Link>
          <Link className="button button--primary" href="/products">
            Explore Products <i className="ph ph-arrow-right"></i>
          </Link>
        </div>
      </div>
    </article>
  );
}

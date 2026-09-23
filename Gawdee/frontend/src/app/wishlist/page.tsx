'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWishlist } from '@/context/WishlistContext';
import { api } from '@/lib/api';
import { CatalogItem } from '@/types';
import { ProductCard } from '@/components/ProductCard';

export default function WishlistPage() {
  const { wishlistIds } = useWishlist();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.catalog.getItems()
      .then((res) => {
        if (res.ok && Array.isArray(res.items)) {
          setItems(res.items);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // A saved id may be a variant id (PDP hearts, drawer adds) or an item id.
  const savedItems = items.filter(
    (item) =>
      wishlistIds.includes(String(item.id)) ||
      (item.variants ?? []).some((v) => wishlistIds.includes(String(v.id)))
  );

  return (
    <div style={{ padding: '3rem 0 6rem' }}>
      <div className="container">
        <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <span style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
            Saved Essentials
          </span>
          <h1 style={{ fontSize: '2.4rem', margin: '0.3rem 0', color: '#111' }}>
            My Wishlist ({savedItems.length})
          </h1>
          <p style={{ color: '#777', maxWidth: '500px', margin: '0 auto' }}>
            Your curated selection of pure rituals, ready for your pantry whenever you are.
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#888' }}>
            <i className="ph ph-spinner ph-spin" style={{ fontSize: '2rem', color: '#009a84' }}></i>
            <p style={{ marginTop: '0.5rem' }}>Loading wishlist…</p>
          </div>
        ) : savedItems.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '20px', padding: '5rem 2rem', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
            <span style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fff0f0', color: '#e03131', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: '1rem' }}>
              <i className="ph ph-heart"></i>
            </span>
            <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>Your wishlist is empty</h2>
            <p style={{ color: '#777', marginBottom: '1.5rem' }}>
              Tap the heart icon on any product to save your favourites for later.
            </p>
            <Link className="button button--primary" href="/products">
              Explore Pure Products <i className="ph ph-arrow-right"></i>
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '1.5rem' }}>
            {savedItems.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

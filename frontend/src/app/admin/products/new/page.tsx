'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import CatalogItemForm, { emptyItemForm } from '@/components/admin/CatalogItemForm';

export default function NewCatalogItemPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const catRes = await adminApi.getCategories().catch(() => ({ ok: false, categories: [] }));
        if (catRes?.ok) setCategories(catRes.categories || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load categories');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>;

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div>
          <h2>Add Catalog Item &amp; Variants</h2>
          <p>Manage base product information and configure multi-variant pricing, SKUs, and stock.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin?view=products">
          <i className="ph ph-arrow-left"></i> Back to catalogue
        </Link>
      </div>
      {error ? (
        <div className="admin-alert admin-alert--error">{error}</div>
      ) : (
        <CatalogItemForm
          initialData={emptyItemForm(categories[0]?.id ?? null)}
          categories={categories}
        />
      )}
    </section>
  );
}

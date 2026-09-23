'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import CatalogItemForm, { itemToFormData } from '@/components/admin/CatalogItemForm';

export default function EditCatalogItemPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [categories, setCategories] = useState<any[]>([]);
  const [initialData, setInitialData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError('Invalid item id.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [itemRes, catRes] = await Promise.all([
          adminApi.catalogAdminGetItem(id),
          adminApi.getCategories().catch(() => ({ ok: false, categories: [] })),
        ]);
        if (catRes?.ok) setCategories(catRes.categories || []);
        if (itemRes?.ok && itemRes.item) {
          setInitialData(itemToFormData(itemRes.item));
        } else {
          throw new Error('Item not found.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load item.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading item…</div>;

  if (error || !initialData) {
    return (
      <section className="admin-card">
        <div className="admin-alert admin-alert--error">{error || 'Item not found.'}</div>
        <Link className="admin-button admin-button--ghost" href="/admin?view=products" style={{ marginTop: '12px' }}>
          <i className="ph ph-arrow-left"></i> Back to catalogue
        </Link>
      </section>
    );
  }

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div>
          <h2>Edit Catalog Item: {initialData.name}</h2>
          <p>Manage base product information and configure multi-variant pricing, SKUs, and stock.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin?view=products">
          <i className="ph ph-arrow-left"></i> Back to catalogue
        </Link>
      </div>
      <CatalogItemForm initialData={initialData} categories={categories} />
    </section>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';

// Mirrors backend make_slug: lowercase, non-alphanumerics → hyphen.
export function autoSlug(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeMarketingContent(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? { image_sections: parsed } : (parsed || {});
    } catch {
      return {};
    }
  }
  if (Array.isArray(value)) {
    return { image_sections: value };
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
}

export function emptyItemForm(defaultCategoryId: number | null = null): any {
  return {
    name: '',
    categoryId: defaultCategoryId,
    flavor: '',
    tag: '',
    accent: '#0a7540',
    imageUrl: '',
    hoverImageUrl: '',
    description: '',
    is_active: true,
    rich_image_sections: {},
    variants: [],
    origVariants: {},
  };
}

export function itemToFormData(p: any): any {
  return {
    id: p.id,
    name: p.name || '',
    flavor: p.flavor || '',
    categoryId: p.categoryId ?? p.categoryObj?.id ?? null,
    tag: p.tag || '',
    accent: p.accent || '#0a7540',
    imageUrl: p.imageUrl || p.image || '',
    hoverImageUrl: p.hoverImageUrl || p.hoverImage || '',
    description: p.description || '',
    is_active: p.isActive !== 0,
    rich_image_sections: normalizeMarketingContent(
      p.richImageSections || p.rich_image_sections || p.marketing_content
    ),
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      variantName: v.variantName || 'Standard',
      sku: v.sku || '',
      stock: Number(v.stock) || 0,
      mrp: Number(v.mrp) || 0,
      sellingPrice: Number(v.sellingPrice) || 0,
      discount: Number(v.discount) || 0,
      discountPercent: Number(v.discountPercent) || 0,
      uom: v.uom || '',
      isInclusive: v.isInclusive !== false,
      isLabTested: v.isLabTested !== false,
      isNatural: v.isNatural !== false,
      isActive: v.isActive !== 0,
      image: v.image || '',
      images: (v.images || []).map((g: any) => ({
        id: g.id,
        name: g.name || '',
        imageUrl: g.imageUrl || g.image || '',
        sortOrder: g.sortOrder ?? g.sort_order ?? 0,
      })),
    })),
    origVariants: Object.fromEntries(
      (p.variants || []).map((v: any) => [
        v.id,
        { mrp: Number(v.mrp) || 0, sellingPrice: Number(v.sellingPrice) || 0 },
      ])
    ),
  };
}

function VariantImageManager({
  images,
  uploading,
  onUpload,
  onRename,
  onReplace,
  onDelete,
  onMove,
}: {
  images: any[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onRename: (imageId: number, name: string) => void;
  onReplace: (imageId: number, file: File) => void;
  onDelete: (imageId: number) => void;
  onMove: (imageId: number, dir: -1 | 1) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <strong style={{ fontSize: '0.72rem', color: '#005c4e' }}>
          <i className="ph ph-images"></i> Variant images ({images.length})
        </strong>
        <label
          className="admin-button admin-button--secondary"
          style={{ fontSize: '0.68rem', padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <i className="ph ph-upload-simple"></i> {uploading ? 'Uploading…' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {images.length === 0 ? (
        <p style={{ fontSize: '0.7rem', color: '#88968d', margin: 0 }}>
          No images yet — upload the first one. The first image is used as the variant cover.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {images.map((g: any, gi: number) => (
            <div
              key={g.id ?? gi}
              style={{ border: '1px solid #e1e7e2', borderRadius: '10px', padding: '8px', background: '#fff' }}
            >
              <img
                src={g.imageUrl ? `/${String(g.imageUrl).replace(/^\//, '')}` : '/assets/images/logo.png'}
                alt={g.name || `Variant image ${gi + 1}`}
                style={{ width: '100%', height: '90px', objectFit: 'contain', borderRadius: '6px', background: '#f8faf9' }}
                loading="lazy"
              />
              <input
                type="text"
                placeholder="Image name (e.g. Front)"
                defaultValue={g.name || ''}
                key={`name-${g.id}-${g.name}`}
                onBlur={(e) => {
                  if (e.target.value !== (g.name || '')) onRename(g.id, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ width: '100%', marginTop: '6px', padding: '5px 7px', fontSize: '0.68rem' }}
                aria-label="Image name"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                <button type="button" className="admin-action-icon" style={{ width: '26px', height: '26px' }} disabled={gi === 0} onClick={() => onMove(g.id, -1)} title="Move earlier" aria-label="Move image earlier">
                  <i className="ph ph-arrow-up"></i>
                </button>
                <button type="button" className="admin-action-icon" style={{ width: '26px', height: '26px' }} disabled={gi === images.length - 1} onClick={() => onMove(g.id, 1)} title="Move later" aria-label="Move image later">
                  <i className="ph ph-arrow-down"></i>
                </button>
                <label className="admin-action-icon" style={{ width: '26px', height: '26px', cursor: 'pointer' }} title="Replace image">
                  <i className="ph ph-arrows-clockwise"></i>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onReplace(g.id, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button type="button" className="admin-action-icon admin-action-icon--danger" style={{ width: '26px', height: '26px', marginLeft: 'auto' }} onClick={() => onDelete(g.id)} title="Delete image" aria-label="Delete image">
                  <i className="ph ph-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CatalogItemForm({
  initialData,
  categories,
  onSaved,
}: {
  initialData?: any | null;
  categories: any[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<any>(
    () => initialData || emptyItemForm(categories?.[0]?.id ?? null)
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedImgVariant, setExpandedImgVariant] = useState<string | number | null>(null);

  useEffect(() => {
    if (initialData) setFormData(initialData);
  }, [initialData]);

  const showFlash = (message: string, type: 'success' | 'error' = 'success') => {
    setFlash({ message, type });
    window.setTimeout(() => setFlash(null), 4000);
  };

  const handleUploadImage = async (file: File, callback: (url: string) => void, folder: string = 'products') => {
    setUploadingImage(true);
    try {
      const res = await adminApi.uploadMedia(file, folder);
      const url = res?.file_path || res?.path || res?.url;
      if (res?.ok && url) {
        callback(url);
        showFlash('Image uploaded successfully');
      } else {
        throw new Error(res?.detail || 'Upload failed');
      }
    } catch (err: any) {
      showFlash(err.message || 'Image upload error', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleUploadProductMedia = async (file: File, callback: (url: string) => void) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showFlash('Choose an image or video file.', 'error');
      return;
    }
    setUploadingImage(true);
    try {
      const res = await adminApi.uploadMedia(file, 'product-story');
      const url = res?.file_path || res?.path || res?.url;
      if (!res?.ok || !url) throw new Error(res?.detail || 'Upload failed');
      callback(url);
      showFlash('Media uploaded. Save the product to publish it.');
    } catch (err: any) {
      showFlash(err.message || 'Media upload error', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const patchVariantImages = (vKey: string | number, images: any[]) => {
    setFormData((prev: any) => ({
      ...prev,
      variants: (prev.variants || []).map((v: any, i: number) =>
        (v.id ?? `new-${i}`) === vKey ? { ...v, images } : v
      ),
    }));
  };

  const handleAddVariantImage = async (vKey: string | number, variantId: number, file: File) => {
    await handleUploadImage(file, async (url) => {
      try {
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Image';
        const res = await adminApi.catalogAddVariantImage(variantId, { name: base, imageUrl: url });
        if (res?.ok && res.image) {
          setFormData((prev: any) => ({
            ...prev,
            variants: (prev.variants || []).map((v: any, i: number) =>
              (v.id ?? `new-${i}`) === vKey
                ? { ...v, images: [...(v.images || []), { id: res.image.id, name: res.image.name, imageUrl: res.image.imageUrl }] }
                : v
            ),
          }));
          showFlash('Image added to variant');
        }
      } catch (err: any) {
        showFlash(err.message || 'Failed to add image', 'error');
      }
    });
  };

  const handleRenameVariantImage = async (vKey: string | number, imageId: number, name: string) => {
    try {
      await adminApi.catalogUpdateVariantImage(imageId, { name });
      patchVariantImages(vKey, (formData.variants || [])
        .find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey)?.images
        ?.map((g: any) => (g.id === imageId ? { ...g, name } : g)) || []);
      showFlash('Image name updated');
    } catch (err: any) {
      showFlash(err.message || 'Failed to rename image', 'error');
    }
  };

  const handleDeleteVariantImage = async (vKey: string | number, imageId: number) => {
    if (!confirm('Delete this image?')) return;
    try {
      await adminApi.catalogDeleteVariantImage(imageId);
      const row = (formData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
      patchVariantImages(vKey, (row?.images || []).filter((g: any) => g.id !== imageId));
      showFlash('Image deleted');
    } catch (err: any) {
      showFlash(err.message || 'Failed to delete image', 'error');
    }
  };

  const handleReplaceVariantImage = async (vKey: string | number, imageId: number, file: File) => {
    await handleUploadImage(file, async (url) => {
      try {
        await adminApi.catalogUpdateVariantImage(imageId, { imageUrl: url });
        const row = (formData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
        patchVariantImages(vKey, (row?.images || []).map((g: any) => (g.id === imageId ? { ...g, imageUrl: url } : g)));
        showFlash('Image replaced');
      } catch (err: any) {
        showFlash(err.message || 'Failed to replace image', 'error');
      }
    });
  };

  const handleReorderVariantImage = async (vKey: string | number, imageId: number, dir: -1 | 1) => {
    const row = (formData.variants || []).find((v: any, i: number) => (v.id ?? `new-${i}`) === vKey);
    const imgs = [...(row?.images || [])].sort((a: any, b: any) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));
    const idx = imgs.findIndex((g: any) => g.id === imageId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= imgs.length) return;
    try {
      const [a, b] = [imgs[idx], imgs[j]];
      const aOrder = a.sortOrder ?? a.sort_order ?? idx;
      const bOrder = b.sortOrder ?? b.sort_order ?? j;
      await adminApi.catalogUpdateVariantImage(a.id, { sortOrder: bOrder });
      await adminApi.catalogUpdateVariantImage(b.id, { sortOrder: aOrder });
      const next = [...imgs];
      next[idx] = { ...b, sortOrder: bOrder };
      next[j] = { ...a, sortOrder: aOrder };
      patchVariantImages(vKey, next);
    } catch (err: any) {
      showFlash(err.message || 'Failed to reorder images', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const name = (formData.name || '').trim();
      if (!name) throw new Error('Product name is required.');
      const rows = formData.variants || [];
      if (rows.length === 0) throw new Error('Add at least one variant.');
      rows.forEach((v: any, i: number) => {
        const label = v.variantName || `Variant ${i + 1}`;
        if (!(v.variantName || '').trim()) throw new Error(`Variant ${i + 1}: size/weight name is required.`);
        const mrp = Number(v.mrp ?? 0);
        const sell = Number(v.sellingPrice ?? 0);
        const stock = Number(v.stock ?? 0);
        if (!Number.isFinite(mrp) || mrp < 0) throw new Error(`${label}: MRP must be 0 or more.`);
        if (!Number.isFinite(sell) || sell < 0) throw new Error(`${label}: selling price must be 0 or more.`);
        if (!Number.isInteger(stock) || stock < 0) throw new Error(`${label}: stock must be a whole number, 0 or more.`);
        if (v.uom && !/^[A-Za-z]{1,10}$/.test(String(v.uom).trim())) throw new Error(`${label}: UOM must be 1–10 letters (e.g. g, kg, ml).`);
      });
      const cat = categories.find((c: any) => c.id === formData.categoryId);
      const normalizedMarketing = { ...normalizeMarketingContent(formData.rich_image_sections || {}) };
      normalizedMarketing.video_url = String(normalizedMarketing.video_url || normalizedMarketing.videoUrl || '').trim();
      delete normalizedMarketing.videoUrl;
      for (const field of ['gallery', 'uses', 'benefits', 'advantages']) {
        if (Array.isArray(normalizedMarketing[field])) {
          normalizedMarketing[field] = normalizedMarketing[field].map((value: string) => String(value).trim()).filter(Boolean);
        }
      }
      if (Array.isArray(normalizedMarketing.faqs)) {
        normalizedMarketing.faqs = normalizedMarketing.faqs
          .map((faq: any) => ({ question: String(faq.question || '').trim(), answer: String(faq.answer || '').trim() }))
          .filter((faq: any) => faq.question && faq.answer);
      }
      const payload = {
        id: formData.id || undefined,
        name,
        slug: autoSlug(name) || (formData.id ? `item-${formData.id}` : undefined),
        category: cat?.name || '',
        category_key: cat?.filter || '',
        category_id: formData.categoryId ?? null,
        flavor: formData.flavor || '',
        tag: formData.tag || '',
        accent: formData.accent || '#0a7540',
        image: formData.imageUrl || formData.image || '',
        image_url: formData.imageUrl || formData.image || '',
        hover_image: formData.hoverImageUrl || '',
        hover_image_url: formData.hoverImageUrl || '',
        description: formData.description || '',
        is_active: formData.is_active ? 1 : 0,
        rich_image_sections: normalizedMarketing,
        variants: rows.map((v: any) => ({
          id: typeof v.id === 'number' ? v.id : undefined,
          variant_name: (v.variantName || 'Standard').trim(),
          sku: (v.sku || '').trim(),
          stock_quantity: Math.max(0, parseInt(v.stock ?? 0) || 0),
          mrp: Math.max(0, parseInt(v.mrp ?? 0) || 0),
          selling_price: Math.max(0, parseInt(v.sellingPrice ?? 0) || 0),
          uom: (v.uom || '').trim(),
          is_inclusive_tax: v.isInclusive !== false ? 1 : 0,
          is_lab_tested: v.isLabTested !== false ? 1 : 0,
          is_natural: v.isNatural !== false ? 1 : 0,
          is_active: v.isActive !== false ? 1 : 0,
          image: v.image || '',
        })),
      };

      await adminApi.saveItem(payload);
      showFlash(formData.id ? 'Item updated successfully' : 'Item and variants created successfully');
      if (onSaved) onSaved();
      else router.push('/admin?view=products');
    } catch (err: any) {
      showFlash(err.message || 'Failed to save item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const marketing = normalizeMarketingContent(formData.rich_image_sections || {});
  const updateMarketing = (patch: Record<string, any> | ((current: Record<string, any>) => Record<string, any>)) =>
    setFormData((prev: any) => {
      const current = normalizeMarketingContent(prev.rich_image_sections);
      return { ...prev, rich_image_sections: { ...current, ...(typeof patch === 'function' ? patch(current) : patch) } };
    });
  const updateListField = (key: string, value: string) => updateMarketing({ [key]: value.split('\n') });
  const addFaq = () => updateMarketing({ faqs: [...(marketing.faqs || []), { question: '', answer: '' }] });
  const updateFaq = (index: number, field: 'question' | 'answer', value: string) => {
    const newFaqs = [...(marketing.faqs || [])];
    newFaqs[index] = { ...(newFaqs[index] || {}), [field]: value };
    updateMarketing({ faqs: newFaqs });
  };
  const sections = Array.isArray(marketing.image_sections) ? marketing.image_sections : [];

  return (
    <>
      {flash && (
        <div
          className={`admin-alert admin-flash ${flash.type === 'error' ? 'admin-alert--error' : 'admin-alert--success'}`}
          style={{ marginBottom: '1.5rem' }}
        >
          <i className={`ph ${flash.type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'}`}></i>{' '}
          {flash.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form">
        {/* SECTION 1: ITEM DETAILS */}
        <div style={{ background: '#fbfcfb', border: '1px solid #e5ede7', borderRadius: '14px', padding: '18px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ph ph-package"></i> 1. Base Item Information
          </h4>

          <label>
            <span>Product Name *</span>
            <input
              type="text"
              required
              placeholder="e.g. A2 Gir Cow Cultured Bilona Ghee"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </label>

          <div style={{ marginTop: '12px' }}>
            <small style={{ color: '#77887e' }}>
              URL Slug: <code>{autoSlug(formData.name || '') || (formData.id ? `item-${formData.id}` : '—')}</code>
              <span style={{ color: '#999' }}> (generated automatically from the product name)</span>
            </small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '12px' }}>
            <label>
              <span>Category *</span>
              <select
                value={formData.categoryId ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    categoryId: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">No category</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Flavor / Subtitle</span>
              <input
                type="text"
                placeholder="e.g. Cultured Bilona Method"
                value={formData.flavor || ''}
                onChange={(e) => setFormData({ ...formData, flavor: e.target.value })}
              />
            </label>

            <label>
              <span>Badge / Tag</span>
              <input
                type="text"
                placeholder="e.g. Pure Vedic, Bestseller"
                value={formData.tag || ''}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label>
              <span>Item Image (card / listing)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {formData.imageUrl ? (
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={`/${String(formData.imageUrl).replace(/^\//, '')}`}
                      alt=""
                      style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f8faf9' }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                      title="Remove item image"
                      aria-label="Remove item image"
                      style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e1e7e2', background: '#fff', cursor: 'pointer', fontSize: '0.6rem', lineHeight: 1, color: '#b00' }}
                    >
                      <i className="ph ph-x"></i>
                    </button>
                  </span>
                ) : null}
                <input
                  type="text"
                  placeholder="/assets/images/products/... or upload"
                  value={formData.imageUrl || ''}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                />
                <label className="admin-button admin-button--ghost" style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}>
                  <i className="ph ph-upload-simple"></i> Upload
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadImage(file, (url) => {
                          setFormData((prev: any) => ({ ...prev, imageUrl: url }));
                        });
                      }
                    }}
                  />
                </label>
              </div>
            </label>

            <label style={{ display: 'block', marginTop: '12px' }}>
              <span>Hover Image (card hover)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {formData.hoverImageUrl ? (
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={`/${String(formData.hoverImageUrl).replace(/^\//, '')}`}
                      alt=""
                      style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e1e7e2', background: '#f8faf9' }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, hoverImageUrl: '' })}
                      title="Remove hover image"
                      aria-label="Remove hover image"
                      style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e1e7e2', background: '#fff', cursor: 'pointer', fontSize: '0.6rem', lineHeight: 1, color: '#b00' }}
                    >
                      <i className="ph ph-x"></i>
                    </button>
                  </span>
                ) : null}
                <input
                  type="text"
                  placeholder="/assets/images/products/... or upload"
                  value={formData.hoverImageUrl || ''}
                  onChange={(e) => setFormData({ ...formData, hoverImageUrl: e.target.value })}
                />
                <label className="admin-button admin-button--ghost" style={{ whiteSpace: 'nowrap', cursor: 'pointer', padding: '9px 12px' }}>
                  <i className="ph ph-upload-simple"></i> Upload
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadImage(file, (url) => {
                          setFormData((prev: any) => ({ ...prev, hoverImageUrl: url }));
                        });
                      }
                    }}
                  />
                </label>
              </div>
            </label>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label>
              <span>Description</span>
              <textarea
                rows={3}
                placeholder="Traditional hand-churned Vedic Bilona method from free-grazing Gir cows..."
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="form-switch" style={{ padding: 0 }}>
              <input
                type="checkbox"
                checked={formData.is_active !== false && formData.is_active !== 0}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span>Item is visible &amp; active in storefront catalogue</span>
            </label>
          </div>
        </div>

        {/* SECTION 2: VARIANTS & SIZES TABLE */}
        <div style={{ background: '#fff', border: '1px solid #e1e7e2', borderRadius: '14px', padding: '18px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph ph-stack"></i> 2. Size Variants &amp; Pricing ({formData.variants?.length || 0})
              </h4>
              <small style={{ color: '#77887e', fontSize: '0.65rem' }}>
                Configure weight sizes, individual SKUs, inventory counts, MRP, and discounts.
              </small>
            </div>
            <button
              type="button"
              className="admin-button admin-button--secondary"
              style={{ fontSize: '0.68rem', padding: '6px 12px' }}
              onClick={() => {
                const count = (formData.variants || []).length;
                const defaultName = count === 0 ? '250 ml' : count === 1 ? '500 ml' : count === 2 ? '1 Litre' : `Size ${count + 1}`;
                setFormData({
                  ...formData,
                  variants: [
                    ...(formData.variants || []),
                    {
                      variantName: defaultName,
                      sku: '',
                      stock: 0,
                      mrp: 0,
                      sellingPrice: 0,
                      discount: 0,
                      uom: '',
                      isInclusive: true,
                      isLabTested: true,
                      isNatural: true,
                      isActive: true,
                      image: '',
                      images: [],
                    },
                  ],
                });
              }}
            >
              <i className="ph ph-plus-circle"></i> Add variant
            </button>
          </div>

          <div className="admin-table-wrap" style={{ border: '1px solid #edf0ed', borderRadius: '10px' }}>
            <table className="admin-table" style={{ fontSize: '0.68rem' }}>
              <thead>
                <tr>
                  <th>Size / Weight</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>MRP (₹)</th>
                  <th>Selling (₹)</th>
                  <th>Discount</th>
                  <th>UOM</th>
                  <th>Tax</th>
                  <th>Lab Tested</th>
                  <th>Natural</th>
                  <th>Active</th>
                  <th>Images</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(formData.variants || []).map((v: any, idx: number) => {
                  const vKey = v.id ?? `new-${idx}`;
                  const orig = v.id ? formData.origVariants?.[v.id] : undefined;
                  const dirty = !orig
                    ? true
                    : Number(v.mrp) !== Number(orig.mrp) || Number(v.sellingPrice) !== Number(orig.sellingPrice);
                  const shownDiscount = Number(v.discountPercent ?? v.discount) || 0;
                  const imgCount = (v.images || []).length;
                  const expanded = expandedImgVariant === vKey;
                  return (
                    <React.Fragment key={v.id ?? `new-${idx}`}>
                      <tr>
                        <td style={{ minWidth: '100px' }}>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 500 ml"
                            value={v.variantName || ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], variantName: e.target.value };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ minWidth: '110px' }}>
                          <input
                            type="text"
                            placeholder="Auto / SKU"
                            value={v.sku || ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], sku: e.target.value.toUpperCase() };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ width: '70px' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            value={v.stock ?? ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], stock: parseInt(e.target.value) || 0 };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ width: '80px' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="₹ MRP"
                            value={v.mrp ?? ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], mrp: parseInt(e.target.value) || 0 };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ width: '80px' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="₹ Price"
                            value={v.sellingPrice ?? ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem', fontWeight: 'bold', color: '#005c4e' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], sellingPrice: parseInt(e.target.value) || 0 };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ width: '80px', textAlign: 'center' }}>
                          {dirty ? (
                            <small style={{ color: '#999', fontStyle: 'italic' }} title="Calculated by the backend on save">auto on save</small>
                          ) : shownDiscount > 0 ? (
                            <strong style={{ color: '#005c4e' }}>{shownDiscount}%</strong>
                          ) : (
                            <span style={{ color: '#aaa' }}>—</span>
                          )}
                        </td>
                        <td style={{ width: '60px' }}>
                          <input
                            type="text"
                            placeholder="ml"
                            value={v.uom || ''}
                            style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], uom: e.target.value };
                              setFormData({ ...formData, variants: newV });
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'center', width: '44px' }}>
                          <input
                            type="checkbox"
                            checked={v.isInclusive !== false}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], isInclusive: e.target.checked };
                              setFormData({ ...formData, variants: newV });
                            }}
                            title="Tax included"
                          />
                        </td>
                        <td style={{ textAlign: 'center', width: '52px' }}>
                          <input
                            type="checkbox"
                            checked={v.isLabTested !== false}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], isLabTested: e.target.checked };
                              setFormData({ ...formData, variants: newV });
                            }}
                            title="Lab tested"
                          />
                        </td>
                        <td style={{ textAlign: 'center', width: '52px' }}>
                          <input
                            type="checkbox"
                            checked={v.isNatural !== false}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], isNatural: e.target.checked };
                              setFormData({ ...formData, variants: newV });
                            }}
                            title="Natural"
                          />
                        </td>
                        <td style={{ textAlign: 'center', width: '44px' }}>
                          <input
                            type="checkbox"
                            checked={v.isActive !== false}
                            onChange={(e) => {
                              const newV = [...formData.variants];
                              newV[idx] = { ...newV[idx], isActive: e.target.checked };
                              setFormData({ ...formData, variants: newV });
                            }}
                            title="Active"
                          />
                        </td>
                        <td style={{ textAlign: 'center', width: '70px' }}>
                          <button
                            type="button"
                            className="admin-button admin-button--ghost"
                            style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                            onClick={() => setExpandedImgVariant(expanded ? null : vKey)}
                            aria-expanded={expanded}
                            title="Manage variant images"
                          >
                            <i className="ph ph-images"></i> {imgCount}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center', width: '44px' }}>
                          <button
                            type="button"
                            disabled={formData.variants?.length <= 1}
                            onClick={() => {
                              if (formData.variants?.length <= 1) return;
                              const newV = formData.variants.filter((_: any, i: number) => i !== idx);
                              setFormData({ ...formData, variants: newV });
                            }}
                            className="admin-action-icon admin-action-icon--danger"
                            style={{ opacity: formData.variants?.length <= 1 ? 0.3 : 1, width: '28px', height: '28px' }}
                            title="Delete variant"
                          >
                            <i className="ph ph-trash"></i>
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={13} style={{ background: '#fbfdfb', padding: '12px 16px' }}>
                            {typeof v.id !== 'number' ? (
                              <small style={{ color: '#77887e' }}>
                                <i className="ph ph-info"></i> Save the item first to upload and manage images for this new variant.
                              </small>
                            ) : (
                              <VariantImageManager
                                images={[...(v.images || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))}
                                uploading={uploadingImage}
                                onUpload={(file: File) => handleAddVariantImage(v.id ?? `new-${idx}`, v.id, file)}
                                onRename={(imageId: number, name: string) => handleRenameVariantImage(v.id ?? `new-${idx}`, imageId, name)}
                                onReplace={(imageId: number, file: File) => handleReplaceVariantImage(v.id ?? `new-${idx}`, imageId, file)}
                                onDelete={(imageId: number) => handleDeleteVariantImage(v.id ?? `new-${idx}`, imageId)}
                                onMove={(imageId: number, dir: -1 | 1) => handleReorderVariantImage(v.id ?? `new-${idx}`, imageId, dir)}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(formData.variants || []).length === 0 && (
            <p style={{ fontSize: '0.72rem', color: '#b00', marginTop: '10px' }}>
              No variants yet — click “Add variant” to add at least one size before saving.
            </p>
          )}
        </div>

        {/* SECTION 3: PRODUCT MARKETING CONTENT */}
        <div style={{ background: '#fff', border: '1px solid #e1e7e2', borderRadius: '14px', padding: '18px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#005c4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph ph-image"></i> 3. Product Marketing Content
              </h4>
              <small style={{ color: '#77887e', fontSize: '0.65rem' }}>
                Add product video, gallery, uses, benefits, advantages, FAQs, and image sections.
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <label>
              <span>Video URL</span>
              <input
                type="text"
                placeholder="YouTube, Vimeo, MP4 URL, or uploaded video path"
                value={marketing.video_url || marketing.videoUrl || ''}
                onChange={(e) => updateMarketing({ video_url: e.target.value, videoUrl: e.target.value })}
              />
            </label>
            <label className="admin-button admin-button--secondary" style={{ width: 'fit-content', cursor: 'pointer' }}>
              <i className="ph ph-upload-simple"></i> {uploadingImage ? 'Uploading…' : 'Upload product video'}
              <input type="file" accept="video/mp4,video/webm,video/ogg" disabled={uploadingImage} style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadProductMedia(file, (url) => updateMarketing({ video_url: url, videoUrl: url }));
                e.target.value = '';
              }} />
            </label>

            <label>
              <span>Gallery URLs (one per line)</span>
              <textarea
                rows={4}
                placeholder="/assets/images/1.jpg\n/assets/images/2.jpg"
                value={Array.isArray(marketing.gallery) ? marketing.gallery.join('\n') : ''}
                onChange={(e) => updateMarketing({ gallery: e.target.value.split('\n') })}
              />
            </label>
            <label className="admin-button admin-button--secondary" style={{ width: 'fit-content', cursor: 'pointer' }}>
              <i className="ph ph-upload-simple"></i> {uploadingImage ? 'Uploading…' : 'Upload gallery images'}
              <input type="file" accept="image/*" multiple disabled={uploadingImage} style={{ display: 'none' }} onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                for (const file of files) {
                  await handleUploadProductMedia(file, (url) => updateMarketing((current) => ({ gallery: [...(Array.isArray(current.gallery) ? current.gallery : []), url] })));
                }
              }} />
            </label>
            {Array.isArray(marketing.gallery) && marketing.gallery.some((url: string) => url.trim()) && (
              <div className="admin-product-gallery">
                {marketing.gallery.map((url: string, index: number) => url.trim() && (
                  <div className="admin-product-gallery__item" key={`${url}-${index}`}>
                    <img src={url.startsWith('/') || /^https?:\/\//.test(url) ? url : `/${url}`} alt={`Gallery image ${index + 1}`} />
                    <div>
                      <button type="button" disabled={index === 0} aria-label={`Move gallery image ${index + 1} left`} onClick={() => updateMarketing((current) => { const gallery = [...current.gallery]; [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]]; return { gallery }; })}>←</button>
                      <button type="button" disabled={index === marketing.gallery.length - 1} aria-label={`Move gallery image ${index + 1} right`} onClick={() => updateMarketing((current) => { const gallery = [...current.gallery]; [gallery[index], gallery[index + 1]] = [gallery[index + 1], gallery[index]]; return { gallery }; })}>→</button>
                      <button type="button" aria-label={`Remove gallery image ${index + 1}`} onClick={() => updateMarketing((current) => ({ gallery: current.gallery.filter((_: string, i: number) => i !== index) }))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <label>
                <span>Uses (one per line)</span>
                <textarea rows={5} value={(marketing.uses || []).join('\n')} onChange={(e) => updateListField('uses', e.target.value)} />
              </label>
              <label>
                <span>Benefits (one per line)</span>
                <textarea rows={5} value={(marketing.benefits || []).join('\n')} onChange={(e) => updateListField('benefits', e.target.value)} />
              </label>
              <label>
                <span>Advantages (one per line)</span>
                <textarea rows={5} value={(marketing.advantages || []).join('\n')} onChange={(e) => updateListField('advantages', e.target.value)} />
              </label>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, color: '#1d2e27' }}>FAQs</span>
                <button type="button" className="admin-button admin-button--secondary" style={{ fontSize: '0.68rem', padding: '6px 10px' }} onClick={addFaq}>
                  <i className="ph ph-plus"></i> Add FAQ
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(marketing.faqs || []).map((faq: any, idx: number) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'start', padding: '10px', background: '#fbfcfb', border: '1px solid #e1e7e2', borderRadius: '8px' }}>
                    <input
                      type="text"
                      placeholder="Question"
                      value={faq.question || ''}
                      onChange={(e) => updateFaq(idx, 'question', e.target.value)}
                    />
                    <textarea
                      rows={3}
                      placeholder="Answer"
                      value={faq.answer || ''}
                      onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                    />
                    <button type="button" className="admin-action-icon admin-action-icon--danger" onClick={() => updateMarketing({ faqs: (marketing.faqs || []).filter((_: any, i: number) => i !== idx) })}>
                      <i className="ph ph-trash"></i>
                    </button>
                  </div>
                ))}
                {(!marketing.faqs || marketing.faqs.length === 0) && (
                  <div style={{ padding: '14px', border: '1px dashed #e1e7e2', borderRadius: '8px', fontSize: '0.76rem', color: '#77887e', background: '#fbfcfb' }}>
                    No FAQs yet — add common product questions here.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div>
                <strong style={{ color: '#005c4e' }}>Image sections</strong>
                <div style={{ fontSize: '0.65rem', color: '#77887e' }}>1 landscape + 2 portrait images for enhanced storytelling</div>
              </div>
              <button
                type="button"
                className="admin-button admin-button--secondary"
                style={{ fontSize: '0.68rem', padding: '6px 12px' }}
                onClick={() => updateMarketing({ image_sections: [...sections, { landscape: '', portrait_1: '', portrait_2: '' }] })}
              >
                <i className="ph ph-plus"></i> Add Section
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sections.map((sec: any, idx: number) => (
                <div key={idx} style={{ padding: '16px', background: '#fbfcfb', border: '1px solid #e1e7e2', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong>Section {idx + 1}</strong>
                    <button type="button" className="admin-action-icon admin-action-icon--danger" onClick={() => updateMarketing({ image_sections: sections.filter((_: any, i: number) => i !== idx) })}>
                      <i className="ph ph-trash"></i>
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Landscape</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {sec.landscape && <img src={sec.landscape} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                        <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                          <i className="ph ph-upload-simple"></i> Upload
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadImage(file, (url) => { const next = [...sections]; next[idx] = { ...next[idx], landscape: url }; updateMarketing({ image_sections: next }); }); }} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Portrait 1</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {sec.portrait_1 && <img src={sec.portrait_1} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                        <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                          <i className="ph ph-upload-simple"></i> Upload
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadImage(file, (url) => { const next = [...sections]; next[idx] = { ...next[idx], portrait_1: url }; updateMarketing({ image_sections: next }); }); }} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Portrait 2</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {sec.portrait_2 && <img src={sec.portrait_2} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                        <label className="admin-button admin-button--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                          <i className="ph ph-upload-simple"></i> Upload
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadImage(file, (url) => { const next = [...sections]; next[idx] = { ...next[idx], portrait_2: url }; updateMarketing({ image_sections: next }); }); }} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {sections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', background: '#fbfcfb', border: '1px dashed #e1e7e2', borderRadius: '8px', color: '#77887e', fontSize: '0.8rem' }}>
                  No image sections added yet. Click “Add Section” to begin.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', position: 'sticky', bottom: 0, background: '#fff', padding: '12px 0' }}>
          <Link className="admin-button admin-button--ghost" href="/admin?view=products">
            Cancel
          </Link>
          <button
            type="submit"
            className="admin-button admin-button--primary"
            disabled={uploadingImage || saving}
          >
            <i className="ph ph-check"></i> {saving ? 'Saving…' : formData.id ? 'Update Catalog Item' : 'Save Catalog Item & Variants'}
          </button>
        </div>
      </form>
    </>
  );
}

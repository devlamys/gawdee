'use client';

import React, { useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';
import { isVariantAvailable, variantCartLine } from '@/lib/catalog';

export const VariantsDrawer: React.FC = () => {
  const { variantsDrawer, closeVariantsDrawer, items, addItem, updateQuantity, openCart, count, subtotal } = useCart();
  const { isOpen, item, variants } = variantsDrawer;
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeVariantsDrawer();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeVariantsDrawer]);

  if (!mounted || !item) return null;

  const baseTitle = item.name ? item.name.split(' -')[0] : 'Select Option';

  return (
    <>
      <div
        className={`variants-drawer-backdrop ${isOpen ? 'is-open' : ''}`}
        data-variants-backdrop
        onClick={closeVariantsDrawer}
        aria-hidden="true"
      />
      <div
        className={`variants-drawer ${isOpen ? 'is-open' : ''}`}
        data-variants-drawer
        role="dialog"
        aria-modal="true"
        aria-label="Select product variant"
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color, #eee)',
          }}
        >
          <h3
            data-variants-title
            style={{
              margin: 0,
              fontSize: '1.25rem',
              color: 'var(--gawdee-primary-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <i className="ph ph-shopping-cart"></i> <span>{baseTitle}</span>
          </h3>
          <button
            type="button"
            data-variants-close
            onClick={closeVariantsDrawer}
            aria-label="Close variant selector"
            style={{
              background: 'var(--surface-2, #f5f5f5)',
              border: 'none',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-color, #222)',
            }}
          >
            <i className="ph ph-x"></i>
          </button>
        </div>

        <div
          data-variants-list
          style={{
            padding: '1rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {variants.map((v) => {
            const inCart = items.find((line) => line.id === String(v.id));
            const qty = inCart ? inCart.quantity : 0;
            const available = isVariantAvailable(v);
            const hasDiscount = v.mrp > v.sellingPrice;
            const saveAmount = hasDiscount ? v.mrp - v.sellingPrice : 0;
            const vImage = resolveImageUrl(v.image || item.image);

            return (
              <div
                key={v.id || v.slug}
                className="variant-drawer-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--border-color, #eee)',
                  borderRadius: '12px',
                  background: '#fff',
                }}
              >
                <img
                  src={vImage}
                  alt={v.variantName || item.name}
                  style={{
                    width: '60px',
                    height: '60px',
                    objectFit: 'contain',
                    flexShrink: 0,
                    background: '#f8f8f8',
                    borderRadius: '8px',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--text-color, #222)',
                      fontSize: '1rem',
                      marginBottom: '0.2rem',
                    }}
                  >
                    {v.variantName || item.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ color: 'var(--gawdee-primary-dark)', fontSize: '1.1rem' }}>
                      {money(v.sellingPrice)}
                    </strong>
                    {hasDiscount && (
                      <s style={{ color: '#999', fontSize: '0.85rem' }}>{money(v.mrp)}</s>
                    )}
                  </div>
                  {hasDiscount && (
                    <div
                      style={{
                        color: 'var(--gawdee-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginTop: '0.2rem',
                      }}
                    >
                      Save {money(saveAmount)} vs MRP
                    </div>
                  )}
                </div>
                <div>
                  {!available ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        background: '#e0e0e0',
                        color: '#888',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                      }}
                    >
                      OUT OF STOCK
                    </button>
                  ) : qty > 0 ? (
                    <div
                      className="variant-qty-ctrl"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid var(--gawdee-primary)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        height: '36px',
                      }}
                    >
                      <button
                        type="button"
                        data-v-decrease={v.id}
                        onClick={() => updateQuantity(String(v.id), -1)}
                        aria-label="Decrease quantity"
                        style={{
                          background: 'var(--gawdee-primary)',
                          color: 'white',
                          border: 'none',
                          width: '32px',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <i className="ph ph-minus"></i>
                      </button>
                      <span
                        style={{
                          width: '32px',
                          textAlign: 'center',
                          fontWeight: 600,
                          color: 'var(--gawdee-primary-dark)',
                        }}
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        data-v-increase={v.id}
                        onClick={() => updateQuantity(String(v.id), 1)}
                        aria-label="Increase quantity"
                        style={{
                          background: 'var(--gawdee-primary)',
                          color: 'white',
                          border: 'none',
                          width: '32px',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <i className="ph ph-plus"></i>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-v-add={v.id}
                      onClick={() => addItem(variantCartLine(item, v))}
                      style={{
                        background: 'var(--gawdee-primary)',
                        color: 'white',
                        border: 'none',
                        padding: '0 1.2rem',
                        height: '36px',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      ADD <i className="ph ph-shopping-cart"></i>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {count > 0 && (
          <div
            style={{
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-color, #eee)',
              background: '#fafafa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.82rem', color: '#666' }}>
                {count} {count === 1 ? 'item' : 'items'} in bag
              </div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--gawdee-primary-dark)' }}>
                {money(subtotal)}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => {
                closeVariantsDrawer();
                openCart();
              }}
              style={{
                background: 'var(--gawdee-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '99px',
                padding: '0.7rem 1.4rem',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(3, 31, 22, 0.15)',
              }}
            >
              View Bag <i className="ph ph-arrow-right"></i>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

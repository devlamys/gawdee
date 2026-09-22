'use client';

import React from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { money, resolveImageUrl } from '@/lib/utils';

export const CartDrawer: React.FC = () => {
  const { items, isOpen, closeCart, updateQuantity, removeItem, subtotal, count } = useCart();
  const [videoError, setVideoError] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeCart();
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
  }, [isOpen, closeCart]);

  if (!mounted) return null;

  return (
    <>
      <div
        className={`drawer-backdrop ${isOpen ? 'is-open is-active' : ''}`}
        onClick={closeCart}
        aria-hidden="true"
      />
      <aside
        className={`cart-drawer ${isOpen ? 'is-open is-active' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        <div className="cart-drawer__header">

          <div>
            <span className="eyebrow eyebrow--light">Your selection</span>
            <h2 id="cart-title">Shopping bag ({count})</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={closeCart}
            aria-label="Close shopping bag"
          >
            <i className="ph ph-x"></i>
          </button>
        </div>

        {items.length === 0 ? (
          <div
            className="cart-empty"
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <i
              className="ph ph-tote"
              aria-hidden="true"
              style={{
                fontSize: '6rem',
                color: 'var(--gawdee-primary)',
                opacity: 0.85,
                marginBottom: '1.5rem',
              }}
            ></i>
            <h3
              style={{
                fontSize: '1.5rem',
                color: 'var(--gawdee-primary-dark)',
                marginBottom: '0.5rem',
                fontWeight: 700,
              }}
            >
              Nothing in your cart yet.
            </h3>
            <p style={{ color: 'var(--text-muted, #777)', marginBottom: '2rem' }}>
              Let&apos;s fix that with something pure and delicious.
            </p>
            <button
              className="button button--primary"
              type="button"
              onClick={closeCart}
              style={{
                borderRadius: '99px',
                fontSize: '1.1rem',
                padding: '0.8rem 2.5rem',
              }}
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="cart-items" data-cart-items>
              {items.map((item) => (
                <article key={item.id} className="cart-item">
                  <div className="item-product">
                    <img
                      src={resolveImageUrl(item.image)}
                      alt={item.name}
                      width={44}
                      height={44}
                    />
                    <div className="item-details">
                      <h3>{item.name}</h3>
                      {(item.variant_name || item.weight) && (
                        <small style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.78rem', display: 'block', marginTop: '2px' }}>
                          {item.variant_name || item.weight}
                        </small>
                      )}
                      <p className="item-price">{money(item.price * item.quantity)}</p>
                    </div>
                  </div>
                  <div className="item-qty">
                    <div className="cart-item__qty" aria-label={`Quantity for ${item.name}`}>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="item-action">
                    <button
                      className="cart-item__remove"
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <i className="ph ph-trash"></i>
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="cart-summary" style={{ display: 'block' }}>
              <div className="cart-summary__line">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <p>Taxes and delivery are calculated at checkout.</p>
              <Link
                className="button button--primary button--full"
                href="/checkout"
                onClick={closeCart}
              >
                Secure checkout <i className="ph ph-arrow-right"></i>
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

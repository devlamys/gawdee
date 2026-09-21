'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Order } from '@/types';
import { formatOrderTotal } from '@/lib/loyalty';

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order') || '';
  const { customer } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(Boolean(orderNumber && customer));

  useEffect(() => {
    if (orderNumber && customer) {
      api.account.getOrder(orderNumber)
        .then((res) => {
          if (res.ok && res.order) {
            setOrder(res.order);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [orderNumber, customer]);

  return (
    <section className="order-success-shell" style={{ padding: '4rem 1rem 7rem', textAlign: 'center' }}>
      <div
        className="order-success-card"
        style={{
          maxWidth: '560px',
          margin: '0 auto',
          background: '#fff',
          borderRadius: '20px',
          padding: '3rem 2rem',
          boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
          border: '1px solid #eef2ec',
        }}
      >
        <span
          className="order-success-icon"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#e6f6f2',
            color: '#009a84',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            marginBottom: '1.5rem',
          }}
        >
          <i className="ph ph-check"></i>
        </span>

        <span className="eyebrow" style={{ color: '#009a84', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Order Confirmed
        </span>

        <h1 style={{ fontSize: '2.2rem', margin: '0.5rem 0 1rem', color: '#111' }}>
          Thank you! <br />
          <em style={{ color: '#009a84', fontStyle: 'normal' }}>Your wellness ritual is on its way.</em>
        </h1>

        <p style={{ color: '#555', fontSize: '1.05rem', lineHeight: 1.5, marginBottom: '2rem' }}>
          Order <strong>#{orderNumber || 'GAWDEE'}</strong> is now in our care. A confirmation update has been recorded.
        </p>

        {order && (
          <div
            style={{
              background: '#f9faf8',
              borderRadius: '12px',
              padding: '1.2rem',
              marginBottom: '2rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
              textAlign: 'left',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <span style={{ color: '#888', display: 'block' }}>Payment</span>
              <strong style={{ textTransform: 'capitalize' }}>
                {order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_status}
              </strong>
            </div>
            <div>
              <span style={{ color: '#888', display: 'block' }}>Order Total</span>
              <strong>{formatOrderTotal(order)}</strong>
            </div>
            <div>
              <span style={{ color: '#888', display: 'block' }}>Status</span>
              <strong style={{ color: '#009a84', textTransform: 'capitalize' }}>{order.status}</strong>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {customer ? (
            <Link
              className="button button--primary"
              href={`/account/orders/${orderNumber}`}
              style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}
            >
              Track Order Live <i className="ph ph-map-pin"></i>
            </Link>
          ) : (
            <Link
              className="button button--primary"
              href="/products"
              style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}
            >
              Continue Shopping <i className="ph ph-arrow-right"></i>
            </Link>
          )}

          <Link
            className="button button--secondary"
            href={customer ? '/account' : '/register'}
            style={{ padding: '0.8rem 2rem' }}
          >
            {customer ? 'My Account Dashboard' : 'Create an Account to Track Order'}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: '6rem 0', textAlign: 'center' }}>Loading confirmation…</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}

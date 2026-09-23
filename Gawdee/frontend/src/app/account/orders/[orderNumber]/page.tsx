'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Order, OrderItem } from '@/types';
import { money, resolveImageUrl } from '@/lib/utils';
import { formatCoins, formatOrderTotal, formatPaise } from '@/lib/loyalty';

export default function OrderTrackingDetailPage() {
  const params = useParams();
  const orderNumber = params?.orderNumber as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderNumber) return;
    setLoading(true);

    api.account.getOrder(orderNumber)
      .then((res) => {
        if (res.ok && res.order) {
          setOrder(res.order);
          setItems(res.order.items || []);
        } else {
          setError('Order details could not be found.');
        }
      })
      .catch(() => setError('Unable to load order details.'))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 0', color: '#888' }}>
        <i className="ph ph-spinner ph-spin" style={{ fontSize: '2.5rem', color: '#009a84' }}></i>
        <p style={{ marginTop: '0.8rem' }}>Loading tracking updates…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 0' }}>
        <h2>Order Not Found</h2>
        <p style={{ color: '#777', marginTop: '0.5rem' }}>{error || 'The requested order is not available.'}</p>
        <Link className="button button--primary" href="/account" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
          Back to My Account
        </Link>
      </div>
    );
  }

  const steps = [
    { key: 'placed', label: 'Order Placed', desc: 'Order received by Gawdee' },
    { key: 'confirmed', label: 'Confirmed', desc: 'Packed & verified for purity' },
    { key: 'shipped', label: 'In Transit', desc: order.courier_name ? `${order.courier_name} (${order.tracking_number || ''})` : 'Dispatched with courier' },
    { key: 'delivered', label: 'Delivered', desc: 'Arrived at your doorstep' },
  ];

  const currentStatusIndex = ['placed', 'confirmed', 'shipped', 'delivered'].indexOf(order.status.toLowerCase());
  const activeIdx = currentStatusIndex === -1 ? 0 : currentStatusIndex;

  return (
    <div style={{ padding: '3rem 0 6rem' }}>
      <div className="container">
        {/* Breadcrumb */}
        <nav style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1.5rem' }}>
          <Link href="/account" style={{ color: '#009a84' }}>← Back to All Orders</Link>
        </nav>

        {/* Top Header Card */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2rem', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ color: '#009a84', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                Order Tracking
              </span>
              <h1 style={{ fontSize: '2rem', margin: '0.2rem 0', color: '#111' }}>
                {order.order_number}
              </h1>
              <p style={{ color: '#777', margin: 0, fontSize: '0.9rem' }}>
                Placed on {new Date(order.created_at).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', color: '#777', display: 'block' }}>Total Paid / Payable</span>
              <strong style={{ fontSize: '1.8rem', color: '#009a84' }}>{formatOrderTotal(order)}</strong>
            </div>
          </div>
        </div>

        {/* Tracking Timeline */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2.5rem 2rem', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '2rem' }}>Delivery Progress</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '1.2rem', position: 'relative' }}>
            {steps.map((step, idx) => {
              const isDone = idx <= activeIdx;
              const isCurrent = idx === activeIdx;

              return (
                <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isDone ? '#009a84' : '#eee',
                      color: isDone ? '#fff' : '#999',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      marginBottom: '0.8rem',
                      boxShadow: isCurrent ? '0 0 0 4px #d9f3ee' : 'none',
                    }}
                  >
                    {isDone ? <i className="ph ph-check"></i> : idx + 1}
                  </div>
                  <strong style={{ fontSize: '0.95rem', color: isDone ? '#111' : '#888' }}>
                    {step.label}
                  </strong>
                  <small style={{ color: '#888', marginTop: '0.2rem' }}>
                    {step.desc}
                  </small>
                </div>
              );
            })}
          </div>

          {order.tracking_number && (
            <div style={{ marginTop: '2rem', padding: '1rem 1.4rem', background: '#f5f9f7', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong>Courier Waybill: {order.tracking_number}</strong>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                  Carrier: {order.courier_name || 'Delivery Partner'}
                </p>
              </div>
              {order.tracking_url && (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener"
                  className="button button--secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Live Courier Tracking <i className="ph ph-arrow-up-right"></i>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Order Items & Delivery Information */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.8rem' }}>
          {/* Items */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Ordered Items ({items.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #f5f5f5' }}>
                  <img
                    src={resolveImageUrl(item.image)}
                    alt={item.product_name}
                    width={56}
                    height={56}
                    style={{ borderRadius: '8px', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '0.95rem' }}>{item.product_name}</strong>
                    <span style={{ display: 'block', color: '#666', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      Qty: {item.quantity} × {money(item.unit_price)}
                    </span>
                  </div>
                  <strong style={{ color: '#009a84' }}>{money(item.unit_price * item.quantity)}</strong>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#009a84' }}>
                  <span>Discount</span>
                  <span>−{money(order.discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                <span>Delivery</span>
                <span>{order.shipping === 0 ? 'FREE' : money(order.shipping)}</span>
              </div>
              {(order.loyalty_discount_paise ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#009a84' }}>
                  <span>Loyalty Coins ({formatCoins(order.loyalty_coins_redeemed ?? order.loyalty_discount_paise ?? 0)})</span>
                  <span>−{formatPaise(order.loyalty_discount_paise ?? 0)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, borderTop: '1px solid #eee', paddingTop: '0.6rem', marginTop: '0.4rem' }}>
                <span>Grand Total</span>
                <span style={{ color: '#009a84' }}>{formatOrderTotal(order)}</span>
              </div>
              {((order.loyalty_coins_earned ?? 0) > 0 || (order.loyalty_coins_redeemed ?? 0) > 0) && (
                <div style={{ borderTop: '1px solid #eee', marginTop: '0.7rem', paddingTop: '0.9rem', color: '#555' }}>
                  <strong style={{ display: 'block', color: '#111', marginBottom: '0.4rem' }}>Loyalty Coins</strong>
                  {(order.loyalty_coins_earned ?? 0) > 0 && <span style={{ display: 'block' }}>{formatCoins(order.loyalty_coins_earned ?? 0)} coins from this order • {order.loyalty_earn_status || 'Pending'}</span>}
                  {(order.loyalty_coins_redeemed ?? 0) > 0 && <span style={{ display: 'block' }}>{formatCoins(order.loyalty_coins_redeemed ?? 0)} coins used • {formatPaise(order.loyalty_discount_paise ?? 0)}</span>}
                  <Link href="/account/loyalty" style={{ display: 'inline-block', color: '#009a84', marginTop: '0.6rem' }}>View wallet and history →</Link>
                </div>
              )}
            </div>
          </div>

          {/* Delivery & Payment details */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Delivery Address</h2>
            <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#444', marginBottom: '2rem' }}>
              <strong style={{ color: '#111' }}>{order.customer_name}</strong> <br />
              {order.phone} • {order.email} <br />
              {order.address1} <br />
              {order.address2 && <>{order.address2} <br /></>}
              {order.city}, {order.state} — {order.pincode}
            </div>

            <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>Payment Method</h2>
            <div style={{ fontSize: '0.95rem', color: '#444' }}>
              <strong style={{ textTransform: 'capitalize' }}>
                {order.payment_method === 'cod' ? 'Cash on Delivery (COD)' : 'Razorpay Online'}
              </strong>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#666' }}>
                Status: <span style={{ textTransform: 'capitalize', fontWeight: 600, color: order.payment_status === 'paid' ? '#009a84' : '#c19a3d' }}>{order.payment_status}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

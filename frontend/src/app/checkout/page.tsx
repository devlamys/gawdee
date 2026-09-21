'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { money, resolveImageUrl } from '@/lib/utils';
import { env } from '@/config/env';
import { LoyaltyRedemptionQuote, LoyaltyWallet } from '@/types';
import { formatCoins, formatPaise } from '@/lib/loyalty';
import Script from 'next/script';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, count, clearCart } = useCart();
  const { customer } = useAuth();

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');

  // Offer / Coupon (validated against backend settings; server recalculates truth)
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [loyaltyWalletResult, setLoyaltyWalletResult] = useState<{ customerId: number; wallet: LoyaltyWallet } | null>(null);
  const [loyaltyInput, setLoyaltyInput] = useState('');
  const [loyaltyQuote, setLoyaltyQuote] = useState<{ key: string; quote: LoyaltyRedemptionQuote } | null>(null);
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');

  // Store-backed checkout settings (preview only — the server is the source of truth)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(env.defaultShippingThreshold);
  const [shippingFeeValue, setShippingFeeValue] = useState(env.defaultShippingFee);
  const [activeOfferCode, setActiveOfferCode] = useState('');
  const [activeOfferPercent, setActiveOfferPercent] = useState(0);

  // Idempotency token required by POST /api/create-order
  const [checkoutToken, setCheckoutToken] = useState(() => generateCheckoutToken());

  function generateCheckoutToken(): string {
    try {
      const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      return (uuid + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    } catch {
      return `gawdee-checkout-${Date.now()}`;
    }
  }

  // Load real shipping/offer rules from the backend
  useEffect(() => {
    api.getStorefront()
      .then((res) => {
        if (res?.ok && res.settings) {
          const threshold = Number(res.settings.free_shipping_threshold);
          if (Number.isFinite(threshold) && threshold >= 0) setFreeShippingThreshold(threshold);
          const fee = Number(res.settings.shipping_fee);
          if (Number.isFinite(fee) && fee >= 0) setShippingFeeValue(fee);
          if (res.settings.offer_code) setActiveOfferCode(res.settings.offer_code);
          const pct = Number(res.settings.offer_percent);
          if (Number.isFinite(pct) && pct > 0) setActiveOfferPercent(pct);
        }
        if (res.razorpay_enabled === false) {
          setRazorpayAvailable(false);
          setPaymentMethod('cod');
        }
      })
      .catch(() => {});
  }, []);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [razorpayAvailable, setRazorpayAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Autofill customer details if logged in
  useEffect(() => {
    if (customer) {
      if (customer.name) setName(customer.name);
      if (customer.email) setEmail(customer.email);
      if (customer.phone) setPhone(customer.phone);
      if (customer.address1) setAddress1(customer.address1);
      if (customer.address2) setAddress2(customer.address2);
      if (customer.city) setCity(customer.city);
      if (customer.state) setState(customer.state);
      if (customer.pincode) setPincode(customer.pincode);
    }
  }, [customer]);

  const customerId = customer?.id;
  const loyaltyWallet = loyaltyWalletResult && loyaltyWalletResult.customerId === customerId ? loyaltyWalletResult.wallet : null;

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    api.loyalty.getWallet()
      .then((res) => { if (!cancelled && res.ok) setLoyaltyWalletResult({ customerId, wallet: res.wallet }); })
      .catch(() => { if (!cancelled) setLoyaltyError('Unable to load your loyalty balance.'); });
    return () => { cancelled = true; };
  }, [customerId]);

  const shippingFee = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : shippingFeeValue;
  const discountAmount = appliedCoupon ? Math.round((subtotal * discountPercent) / 100) : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);
  const loyaltyContextKey = JSON.stringify({
    customerId: customer?.id ?? null,
    items: items.map((item) => [item.id, item.quantity]),
    coupon: appliedCoupon,
    requestedCoins: loyaltyInput,
  });
  const appliedLoyaltyQuote = loyaltyQuote?.key === loyaltyContextKey ? loyaltyQuote.quote : null;

  const handleApplyLoyalty = async () => {
    setLoyaltyError('');
    const requested = Number(loyaltyInput);
    if (!Number.isSafeInteger(requested) || requested <= 0 || !/^\d+$/.test(loyaltyInput.trim())) {
      setLoyaltyError('Enter a positive whole number of coins.');
      return;
    }
    if (loyaltyWallet && requested > loyaltyWallet.available_coins) {
      setLoyaltyError(`You have ${formatCoins(loyaltyWallet.available_coins)} coins available.`);
      return;
    }
    setLoyaltyBusy(true);
    const requestedForKey = loyaltyContextKey;
    try {
      const quote = await api.loyalty.calculateRedemption({
        items: items.map((item) => ({ id: item.id, quantity: item.quantity })),
        coupon_code: appliedCoupon,
        requested_coins: requested,
      });
      if (!quote.ok || !Number.isSafeInteger(quote.discount_paise) || quote.discount_paise <= 0 ||
          !Number.isSafeInteger(quote.total_paise) || quote.total_paise < 0) {
        throw new Error('These coins cannot be used on this order.');
      }
      setLoyaltyQuote({ key: requestedForKey, quote });
    } catch (err) {
      setLoyaltyQuote(null);
      setLoyaltyError(err instanceof Error ? err.message : 'Could not calculate the loyalty discount.');
    } finally {
      setLoyaltyBusy(false);
    }
  };

  const handleApplyCoupon = () => {
    setCouponError('');
    const code = couponCode.trim().toUpperCase();
    if (!code) return;

    if (activeOfferCode && code === activeOfferCode.toUpperCase()) {
      setAppliedCoupon(activeOfferCode);
      setDiscountPercent(activeOfferPercent);
    } else {
      setCouponError(activeOfferCode ? `Invalid coupon code. Try ${activeOfferCode}.` : 'No offer codes are active right now.');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setErrorMsg('Your shopping bag is empty.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const orderPayload = {
        customer: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address1: address1.trim(),
          address2: address2.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          notes: notes.trim(),
        },
        coupon_code: appliedCoupon,
        loyalty_coins: appliedLoyaltyQuote?.discount_paise ?? 0,
        payment_method: paymentMethod,
        checkout_token: checkoutToken,
        items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
      };

      const res = await api.createOrder(orderPayload);
      if (!res.ok) {
        throw new Error('Could not create order. Please check details.');
      }

      if (paymentMethod === 'cod') {
        clearCart();
        setCheckoutToken(generateCheckoutToken());
        router.push(`/order-success?order=${res.order_number}`);
        return;
      }

      // Razorpay Checkout
      if (paymentMethod === 'razorpay') {
        const rpOrderId = res.razorpay?.order_id;
        const rpKeyId = res.razorpay?.key;
        if (res.already_paid) {
          clearCart();
          setCheckoutToken(generateCheckoutToken());
          router.push(`/order-success?order=${res.order_number}`);
          return;
        }
        if (!rpOrderId || !rpKeyId) {
          throw new Error('Online payment gateway is temporarily unavailable. You can choose Cash on Delivery.');
        }

        if (typeof window.Razorpay === 'undefined') {
          throw new Error('Payment gateway failed to load. Please refresh and try again.');
        }

        const options = {
          key: rpKeyId,
          amount: (res.razorpay?.amount ?? res.total_paise ?? res.total * 100),
          currency: res.razorpay?.currency || 'INR',
          name: res.razorpay?.name || 'Gawdee',
          description: res.razorpay?.description || `Order ${res.order_number}`,
          order_id: rpOrderId,
          prefill: {
            name: name,
            email: email,
            contact: phone,
          },
          theme: {
            color: '#009a84',
          },
          handler: async (response: any) => {
            try {
              const verifyRes = await api.verifyPayment({
                order_number: res.order_number,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (verifyRes.ok) {
                clearCart();
                setCheckoutToken(generateCheckoutToken());
                router.push(`/order-success?order=${res.order_number}`);
              } else {
                setErrorMsg('Payment verification failed. Please contact support.');
                setSubmitting(false);
              }
            } catch (err: any) {
              setErrorMsg(err.message || 'Payment verification error.');
              setSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              setSubmitting(false);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err: any) {
      const detail = (err as { data?: { reset_checkout?: boolean } })?.data;
      if (detail?.reset_checkout) {
        setCheckoutToken(generateCheckoutToken());
      }
      setErrorMsg(err.message || 'Order placement failed.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Script src={env.razorpayCheckoutUrl} strategy="afterInteractive" />

      <section className="checkout-shell" style={{ padding: '3rem 0 6rem' }}>
        <div className="container">
          <div className="checkout-heading" style={{ marginBottom: '2.5rem' }}>
            <Link href="/products" style={{ color: '#009a84', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <i className="ph ph-arrow-left"></i> Continue shopping
            </Link>
            <h1 style={{ fontSize: '2.2rem', margin: '0.4rem 0' }}>
              Almost there. <br />
              <em style={{ color: '#009a84', fontStyle: 'normal' }}>Let’s deliver goodness.</em>
            </h1>
            <p style={{ color: '#777' }}>Your totals are recalculated securely on the server before payment.</p>
          </div>

          {customer ? (
            <div className="checkout-account-banner" style={{ background: '#f2f8f6', border: '1px solid #d9ede7', padding: '1rem 1.4rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Checking out as {customer.name}</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#555' }}>
                  This order will automatically link to your account for tracking.
                </p>
              </div>
              <Link href="/account" style={{ color: '#009a84', fontWeight: 600, fontSize: '0.9rem' }}>
                My account <i className="ph ph-arrow-right"></i>
              </Link>
            </div>
          ) : (
            <div className="checkout-account-banner checkout-account-banner--guest" style={{ background: '#faf9f6', border: '1px solid #eee8dc', padding: '1rem 1.4rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Want order history and real-time tracking?</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#666' }}>
                  Sign in before ordering to link your delivery updates.
                </p>
              </div>
              <Link href="/login" style={{ color: '#c19a3d', fontWeight: 600, fontSize: '0.9rem' }}>
                Sign in <i className="ph ph-arrow-right"></i>
              </Link>
            </div>
          )}

          <div className="checkout-grid">
            {/* Form */}
            <form className="checkout-form" onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Step 1: Contact */}
              <section className="checkout-card" style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '1.8rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#009a84', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                    01
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Contact Details</h2>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#777' }}>For order and delivery notifications</p>
                  </div>
                </div>

                <div className="form-grid-2col">
                  <label style={{ gridColumn: 'span 2' }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Full name *</span>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Email address *</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Phone number *</span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                </div>
              </section>

              {/* Step 2: Address */}
              <section className="checkout-card" style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '1.8rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#009a84', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                    02
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Delivery Address</h2>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#777' }}>Currently shipping pan-India</p>
                  </div>
                </div>

                <div className="form-grid-2col">
                  <label style={{ gridColumn: 'span 2' }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address Line 1 *</span>
                    <input
                      required
                      value={address1}
                      onChange={(e) => setAddress1(e.target.value)}
                      placeholder="Flat, house no., apartment, street"
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label style={{ gridColumn: 'span 2' }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address Line 2 (Optional)</span>
                    <input
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                      placeholder="Landmark, area"
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>City *</span>
                    <input
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>State *</span>
                    <input
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>6-Digit Pincode *</span>
                    <input
                      required
                      pattern="[1-9][0-9]{5}"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="e.g. 560001"
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>Order Note (Optional)</span>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Delivery instructions"
                      style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                    />
                  </label>
                </div>
              </section>

              {/* Step 3: Offer & Payment */}
              <section className="checkout-card" style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '1.8rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#009a84', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                    03
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Offer &amp; Payment Method</h2>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#777' }}>Choose how you’d like to pay</p>
                  </div>
                </div>

                {/* Promo code */}
                <div style={{ marginBottom: '1.5rem', background: '#fafbfa', padding: '1rem', borderRadius: '12px', border: '1px solid #edf2ec' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Have an offer code?</label>
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyCoupon();
                        }
                      }}
                      placeholder={activeOfferCode ? `e.g. ${activeOfferCode}` : 'Enter offer code'}
                      style={{ flex: 1, padding: '0.5rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px', textTransform: 'uppercase' }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="button button--secondary"
                      style={{ padding: '0 1.2rem', minHeight: '38px', height: '38px', lineHeight: '1', fontSize: '0.85rem' }}
                    >
                      Apply
                    </button>
                  </div>
                  {appliedCoupon && (
                    <small style={{ color: '#009a84', display: 'block', marginTop: '0.4rem', fontWeight: 600 }}>
                      <i className="ph ph-check"></i> Code {appliedCoupon} applied! ({discountPercent}% off)
                    </small>
                  )}
                  {couponError && (
                    <small style={{ color: '#d9534f', display: 'block', marginTop: '0.4rem' }}>{couponError}</small>
                  )}
                </div>

                {customer ? (
                  <div style={{ marginBottom: '1.5rem', background: '#f4faf8', padding: '1rem', borderRadius: '12px', border: '1px solid #d9ede7' }}>
                    <strong style={{ display: 'block', marginBottom: '0.3rem' }}>Use Loyalty Coins</strong>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#555' }}>
                      Available: {loyaltyWallet ? formatCoins(loyaltyWallet.available_coins) : 'Loading…'} coins
                      {loyaltyWallet && ` (${formatPaise(loyaltyWallet.equivalent_paise)})`}. 1 coin = ₹0.01.
                    </p>
                    {loyaltyWallet?.balance_review && (
                      <p role="alert" style={{ color: '#a04418', fontSize: '0.85rem' }}>
                        Your loyalty balance needs review. Please contact support before redeeming coins.
                      </p>
                    )}
                    <label htmlFor="loyalty-coins" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Coins to redeem
                    </label>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <input
                        id="loyalty-coins"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={loyaltyInput}
                        onChange={(event) => { setLoyaltyInput(event.target.value); setLoyaltyQuote(null); setLoyaltyError(''); }}
                        placeholder="Enter whole coins"
                        style={{ flex: '1 1 150px', padding: '0.5rem 0.8rem', border: '1px solid #ccc', borderRadius: '8px' }}
                      />
                      <button type="button" onClick={handleApplyLoyalty} disabled={loyaltyBusy || !loyaltyWallet || items.length === 0} className="button button--secondary" style={{ minHeight: '38px', padding: '0 1rem' }}>
                        {loyaltyBusy ? 'Checking…' : 'Apply Coins'}
                      </button>
                      {appliedLoyaltyQuote && (
                        <button type="button" onClick={() => { setLoyaltyQuote(null); setLoyaltyInput(''); }} className="button button--secondary" style={{ minHeight: '38px', padding: '0 1rem' }}>
                          Remove
                        </button>
                      )}
                    </div>
                    {appliedLoyaltyQuote && (
                      <small style={{ display: 'block', marginTop: '0.5rem', color: '#007a69' }}>
                        {formatCoins(appliedLoyaltyQuote.discount_paise)} coins applied for a {formatPaise(appliedLoyaltyQuote.discount_paise)} discount.
                        {' '}Maximum for this order: {formatCoins(appliedLoyaltyQuote.max_redeemable_coins)} coins.
                      </small>
                    )}
                    {!appliedLoyaltyQuote && loyaltyQuote && <small style={{ display: 'block', marginTop: '0.5rem', color: '#866600' }}>Your bag or coupon changed. Apply coins again for a new quote.</small>}
                    {loyaltyError && <small role="alert" style={{ display: 'block', marginTop: '0.5rem', color: '#c62828' }}>{loyaltyError}</small>}
                    <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>The final discount and available balance are checked again when you place the order.</small>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1.5rem' }}>
                    <Link href="/login?return=/checkout" style={{ color: '#009a84', fontWeight: 600 }}>Sign in</Link> to use Loyalty Coins on this order.
                  </p>
                )}

                {/* Payment method selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1.2rem',
                      border: `2px solid ${paymentMethod === 'razorpay' ? '#009a84' : '#eee'}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: paymentMethod === 'razorpay' ? '#f4faf8' : '#fff',
                    }}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value="razorpay"
                      checked={paymentMethod === 'razorpay'}
                      disabled={!razorpayAvailable}
                      onChange={() => setPaymentMethod('razorpay')}
                    />
                    <i className="ph ph-credit-card" style={{ fontSize: '1.6rem', color: '#009a84' }}></i>
                    <div>
                      <strong style={{ display: 'block' }}>Razorpay Online Payment</strong>
                      <small style={{ color: '#666' }}>{razorpayAvailable ? 'Choose from the payment methods available in Razorpay Checkout' : 'Online payment is not configured yet'}</small>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1.2rem',
                      border: `2px solid ${paymentMethod === 'cod' ? '#009a84' : '#eee'}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: paymentMethod === 'cod' ? '#f4faf8' : '#fff',
                    }}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                    />
                    <i className="ph ph-hand-coins" style={{ fontSize: '1.6rem', color: '#c19a3d' }}></i>
                    <div>
                      <strong style={{ display: 'block' }}>Cash on Delivery (COD)</strong>
                      <small style={{ color: '#666' }}>Pay cash or UPI when your parcel arrives</small>
                    </div>
                  </label>
                </div>
              </section>

              {errorMsg && (
                <div style={{ padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: '8px', fontWeight: 500 }}>
                  <i className="ph ph-warning-circle"></i> {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || loyaltyBusy || items.length === 0}
                className="button button--primary"
                style={{ padding: '1rem', fontSize: '1.1rem', width: '100%', justifyContent: 'center' }}
              >
                {submitting ? (
                  <>
                    <i className="ph ph-spinner ph-spin"></i> Processing Order…
                  </>
                ) : (
                  <>
                    <span>Place Order • {appliedLoyaltyQuote ? formatPaise(appliedLoyaltyQuote.total_paise) : money(grandTotal)}</span>
                    <i className="ph ph-lock-key"></i>
                  </>
                )}
              </button>
            </form>

            {/* Order Summary Sidebar */}
            <aside style={{ background: '#fff', border: '1px solid #eee', borderRadius: '16px', padding: '1.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #eee', marginBottom: '1.2rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Bag</span>
                <span style={{ color: '#777', fontSize: '0.9rem' }}>{count} items</span>
              </div>

              {items.length === 0 ? (
                <p style={{ color: '#777' }}>Your bag is currently empty.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                      <img
                        src={resolveImageUrl(item.image)}
                        alt={item.name}
                        width={48}
                        height={48}
                        style={{ borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1, fontSize: '0.85rem' }}>
                        <strong style={{ display: 'block', color: '#111' }}>{item.name}</strong>
                        <span style={{ color: '#777' }}>Qty: {item.quantity}</span>
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {money(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px solid #eee', paddingTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>

                {discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#009a84' }}>
                    <span>Offer Discount</span>
                    <strong>−{money(discountAmount)}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Delivery</span>
                  <strong>{shippingFee === 0 ? <span style={{ color: '#009a84' }}>FREE</span> : money(shippingFee)}</strong>
                </div>

                {appliedLoyaltyQuote && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#009a84' }}>
                    <span>Loyalty Discount ({formatCoins(appliedLoyaltyQuote.discount_paise)} coins)</span>
                    <strong>−{formatPaise(appliedLoyaltyQuote.discount_paise)}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 800, color: '#111', paddingTop: '0.8rem', borderTop: '1px dashed #ddd', marginTop: '0.4rem' }}>
                  <span>Grand Total</span>
                  <span style={{ color: '#009a84' }}>{appliedLoyaltyQuote ? formatPaise(appliedLoyaltyQuote.total_paise) : money(grandTotal)}</span>
                </div>

                {appliedLoyaltyQuote && <small style={{ color: '#666' }}>The server checks this amount again when you place your order.</small>}

                <small style={{ color: '#888', marginTop: '0.4rem' }}>
                  {subtotal >= freeShippingThreshold
                    ? '✓ Free delivery unlocked on your order!'
                    : `Add ₹${freeShippingThreshold - subtotal} more for free delivery.`}
                </small>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

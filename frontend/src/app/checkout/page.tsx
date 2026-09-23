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
import { markOrderForCelebration } from '@/lib/order-celebration';
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
  // Stale cart entries can point at removed uploads — swap dead thumbnails to
  // the logo, and hide the img entirely if even the fallback fails.
  const [deadImgs, setDeadImgs] = useState<string[]>([]);
  const markImgDead = (src: string) => {
    if (!src) return;
    setDeadImgs((prev) => (prev.includes(src) ? prev : [...prev, src]));
  };

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
        items: items.map((i) => ({ id: i.id, quantity: i.quantity, purchase_plan: i.purchase_plan || 'one_time' })),
      };

      const res = await api.createOrder(orderPayload);
      if (!res.ok) {
        throw new Error('Could not create order. Please check details.');
      }

      if (paymentMethod === 'cod') {
        clearCart();
        setCheckoutToken(generateCheckoutToken());
        markOrderForCelebration(res.order_number);
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
          markOrderForCelebration(res.order_number);
          router.push(`/order-success?order=${res.order_number}`);
          return;
        }
        if (!rpOrderId || !rpKeyId) {
          throw new Error('Online payment gateway is temporarily unavailable. You can choose Cash on Delivery.');
        }

        if (typeof window.Razorpay === 'undefined') {
          throw new Error('Payment gateway failed to load. Please refresh and try again.');
        }

        let verificationStarted = false;
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
            if (verificationStarted) return;
            verificationStarted = true;
            rzp.close();
            try {
              const verifyRes = await api.verifyPayment({
                order_number: res.order_number,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (verifyRes.ok) {
                clearCart();
                setCheckoutToken(generateCheckoutToken());
                markOrderForCelebration(res.order_number);
                router.push(`/order-success?order=${res.order_number}`);
              } else {
                setErrorMsg(`We could not confirm payment for ${res.order_number}. If your bank shows a debit, do not pay again; contact the store with this order number.`);
                setSubmitting(false);
              }
            } catch (err: any) {
              setErrorMsg(`We could not confirm payment for ${res.order_number}. ${err.message || 'Please contact the store.'} If your bank shows a debit, do not pay again.`);
              setSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              if (!verificationStarted) setSubmitting(false);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response: { error?: { description?: string } }) => {
          if (verificationStarted) return;
          rzp.close();
          const description = response.error?.description || 'Razorpay could not complete the payment.';
          const message = /website.*does not match/i.test(description)
            ? 'Online payment is unavailable for this store’s current website. Please contact the store.'
            : description;
          setErrorMsg(`${message} Order: ${res.order_number}. If your bank shows a debit, contact the store before paying again.`);
          setSubmitting(false);
        });
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
            <form className="checkout-form" onSubmit={handleSubmitOrder}>
              {/* Step 1: Contact */}
              <section className="checkout-card">
                <div className="checkout-card__heading">
                  <span>01</span>
                  <div>
                    <h2>Contact Details</h2>
                    <p>For order and delivery notifications</p>
                  </div>
                </div>

                <div className="checkout-fields">
                  <label className="checkout-span-2">
                    <span>Full name *</span>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Email address *</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Phone number *</span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </label>
                </div>
              </section>

              {/* Step 2: Address */}
              <section className="checkout-card">
                <div className="checkout-card__heading">
                  <span>02</span>
                  <div>
                    <h2>Delivery Address</h2>
                    <p>Currently shipping pan-India</p>
                  </div>
                </div>

                <div className="checkout-fields">
                  <label className="checkout-span-2">
                    <span>Address Line 1 *</span>
                    <input
                      required
                      value={address1}
                      onChange={(e) => setAddress1(e.target.value)}
                      placeholder="Flat, house no., apartment, street"
                    />
                  </label>
                  <label className="checkout-span-2">
                    <span>Address Line 2 (Optional)</span>
                    <input
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                      placeholder="Landmark, area"
                    />
                  </label>
                  <label>
                    <span>City *</span>
                    <input
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>State *</span>
                    <input
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>6-Digit Pincode *</span>
                    <input
                      required
                      pattern="[1-9][0-9]{5}"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="e.g. 560001"
                    />
                  </label>
                  <label>
                    <span>Order Note (Optional)</span>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Delivery instructions"
                    />
                  </label>
                </div>
              </section>

              {/* Step 3: Offer & Payment */}
              <section className="checkout-card">
                <div className="checkout-card__heading">
                  <span>03</span>
                  <div>
                    <h2>Offer &amp; Payment Method</h2>
                    <p>Choose how you’d like to pay</p>
                  </div>
                </div>

                {/* Promo code */}
                <div className="checkout-coupon">
                  <label><span>Have an offer code?</span></label>
                  <div className="checkout-coupon__input">
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
                    />
                    <button type="button" onClick={handleApplyCoupon}>
                      Apply
                    </button>
                  </div>
                  {appliedCoupon && (
                    <small style={{ color: '#009a84' }}>
                      <i className="ph ph-check"></i> Code {appliedCoupon} applied! ({discountPercent}% off)
                    </small>
                  )}
                  {couponError && (
                    <small style={{ color: '#d9534f' }}>{couponError}</small>
                  )}
                </div>

                {customer ? (
                  <div className="checkout-loyalty">
                    <strong>Use Loyalty Coins</strong>
                    <p>
                      Available: {loyaltyWallet ? formatCoins(loyaltyWallet.available_coins) : 'Loading…'} coins
                      {loyaltyWallet && ` (${formatPaise(loyaltyWallet.equivalent_paise)})`}. 1 coin = ₹0.01.
                    </p>
                    {loyaltyWallet?.balance_review && (
                      <p role="alert" style={{ color: '#a04418' }}>
                        Your loyalty balance needs review. Please contact support before redeeming coins.
                      </p>
                    )}
                    <label htmlFor="loyalty-coins">
                      Coins to redeem
                    </label>
                    <div className="checkout-coupon__input" style={{ flexWrap: 'wrap' }}>
                      <input
                        id="loyalty-coins"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={loyaltyInput}
                        onChange={(event) => { setLoyaltyInput(event.target.value); setLoyaltyQuote(null); setLoyaltyError(''); }}
                        placeholder="Enter whole coins"
                        style={{ flex: '1 1 150px' }}
                      />
                      <button type="button" onClick={handleApplyLoyalty} disabled={loyaltyBusy || !loyaltyWallet || items.length === 0}>
                        {loyaltyBusy ? 'Checking…' : 'Apply Coins'}
                      </button>
                      {appliedLoyaltyQuote && (
                        <button type="button" onClick={() => { setLoyaltyQuote(null); setLoyaltyInput(''); }}>
                          Remove
                        </button>
                      )}
                    </div>
                    {appliedLoyaltyQuote && (
                      <small style={{ color: '#007a69' }}>
                        {formatCoins(appliedLoyaltyQuote.discount_paise)} coins applied for a {formatPaise(appliedLoyaltyQuote.discount_paise)} discount.
                        {' '}Maximum for this order: {formatCoins(appliedLoyaltyQuote.max_redeemable_coins)} coins.
                      </small>
                    )}
                    {!appliedLoyaltyQuote && loyaltyQuote && <small style={{ color: '#866600' }}>Your bag or coupon changed. Apply coins again for a new quote.</small>}
                    {loyaltyError && <small role="alert" style={{ color: '#c62828' }}>{loyaltyError}</small>}
                    <small>The final discount and available balance are checked again when you place the order.</small>
                  </div>
                ) : (
                  <p className="checkout-loyalty-fallback" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1.5rem' }}>
                    <Link href="/login?return=/checkout" style={{ color: '#009a84', fontWeight: 600 }}>Sign in</Link> to use Loyalty Coins on this order.
                  </p>
                )}

                {/* Payment method selector */}
                <div className="payment-options">
                  <label className="payment-option">
                    <input
                      type="radio"
                      name="payment_method"
                      value="razorpay"
                      checked={paymentMethod === 'razorpay'}
                      disabled={!razorpayAvailable}
                      onChange={() => setPaymentMethod('razorpay')}
                    />
                    <div className="payment-option__card">
                      <i className="ph ph-credit-card"></i>
                      <div>
                        <strong>Razorpay Online Payment</strong>
                        <small>{razorpayAvailable ? 'Choose from the payment methods available in Razorpay Checkout' : 'Online payment is not configured yet'}</small>
                      </div>
                    </div>
                  </label>

                  <label className="payment-option">
                    <input
                      type="radio"
                      name="payment_method"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                    />
                    <div className="payment-option__card">
                      <i className="ph ph-hand-coins" style={{ color: '#c19a3d' }}></i>
                      <div>
                        <strong>Cash on Delivery (COD)</strong>
                        <small>Pay cash or UPI when your parcel arrives</small>
                      </div>
                    </div>
                  </label>
                </div>
              </section>

              {errorMsg && (
                <div role="alert" className="alert alert--danger">
                  <i className="ph ph-warning-circle"></i> {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || loyaltyBusy || items.length === 0}
                className="checkout-submit"
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
            <aside className="checkout-card">
              <div className="checkout-card__heading" style={{ justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <span style={{ background: 'transparent', color: '#111', width: 'auto', height: 'auto', fontSize: '1.1rem' }}>Your Bag</span>
                <p>{count} items</p>
              </div>

              {items.length === 0 ? (
                <p className="empty-state">Your bag is currently empty.</p>
              ) : (
                <div className="checkout-summary-list">
                  {items.map((item) => {
                    const variantLabel =
                      item.type === 'combo'
                        ? 'Combo pack'
                        : (item.variant_name || item.weight || item.uom || '').trim();
                    const rawSrc = resolveImageUrl(item.image);
                    const logoSrc = '/assets/images/logo.png';
                    const logoDead = deadImgs.includes(logoSrc);
                    const imgSrc = deadImgs.includes(rawSrc) ? logoSrc : rawSrc;
                    return (
                    <div key={item.id} className="checkout-summary-item">
                      <div className="checkout-summary-item__image">
                        {logoDead && imgSrc === logoSrc ? (
                          <span className="checkout-summary-item__image-placeholder" aria-hidden="true">
                            <i className="ph ph-image"></i>
                          </span>
                        ) : (
                          <img
                            src={imgSrc}
                            alt=""
                            width={48}
                            height={48}
                            onError={() => markImgDead(imgSrc)}
                          />
                        )}
                        {variantLabel ? (
                          <span className="checkout-summary-item__badge">
                            {variantLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="checkout-summary-item__info">
                        <strong>{item.name}</strong>
                        <span>Qty: {item.quantity}</span>
                      </div>
                      <span className="checkout-summary-item__price">
                        {money(item.price * item.quantity)}
                      </span>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="checkout-summary-totals">
                <div className="checkout-summary-totals__row">
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>

                {discountAmount > 0 && (
                  <div className="checkout-summary-totals__row checkout-summary-totals__row--discount">
                    <span>Offer Discount</span>
                    <strong>−{money(discountAmount)}</strong>
                  </div>
                )}

                <div className="checkout-summary-totals__row">
                  <span>Delivery</span>
                  <strong>{shippingFee === 0 ? <span style={{ color: '#009a84' }}>FREE</span> : money(shippingFee)}</strong>
                </div>

                {appliedLoyaltyQuote && (
                  <div className="checkout-summary-totals__row checkout-summary-totals__row--discount">
                    <span>Loyalty Discount ({formatCoins(appliedLoyaltyQuote.discount_paise)} coins)</span>
                    <strong>−{formatPaise(appliedLoyaltyQuote.discount_paise)}</strong>
                  </div>
                )}

                <div className="checkout-summary-totals__grand">
                  <span>Grand Total</span>
                  <span>{appliedLoyaltyQuote ? formatPaise(appliedLoyaltyQuote.total_paise) : money(grandTotal)}</span>
                </div>

                {appliedLoyaltyQuote && <div className="checkout-summary-totals__note">The server checks this amount again when you place your order.</div>}

                <div className="checkout-summary-totals__note">
                  {subtotal >= freeShippingThreshold
                    ? '✓ Free delivery unlocked on your order!'
                    : `Add ₹${freeShippingThreshold - subtotal} more for free delivery.`}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

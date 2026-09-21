'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminApi,
  type LoyaltyAdminReports,
  type LoyaltyAdminSettings,
  type LoyaltyAdminTransaction,
  type LoyaltyAdminWallet,
  type LoyaltyCategoryRestriction,
  type LoyaltyProductRestriction,
  type LoyaltyRestrictions,
} from '@/lib/admin-api';
import './loyalty.css';

type Notice = { kind: 'success' | 'error'; text: string };
type NumericSetting = Exclude<keyof LoyaltyAdminSettings, 'enabled' | 'min_cart_paise'>;

const settingFields: { key: NumericSetting; label: string; hint: string; min: number; max?: number }[] = [
  { key: 'release_delay_days', label: 'Days after delivery before release', hint: 'Wait until the return window closes.', min: 0 },
  { key: 'min_redemption_coins', label: 'Minimum coins per redemption', hint: 'Use 0 for no minimum.', min: 0 },
  { key: 'max_redemption_coins', label: 'Maximum coins per order', hint: 'Use 0 for no fixed coin cap.', min: 0 },
  { key: 'max_redemption_percent', label: 'Maximum share of eligible cart (%)', hint: 'The server also checks wallet balance and cart eligibility.', min: 0, max: 100 },
  { key: 'expiry_months', label: 'Expiry after release (months)', hint: 'Use 0 to disable expiry.', min: 0 },
  { key: 'expiry_reminder_days', label: 'Expiry reminder lead time (days)', hint: 'Used by the reminder job when expiry is enabled.', min: 0 },
  { key: 'max_earn_per_order', label: 'Maximum coins earned per order', hint: 'Use 0 for no cap.', min: 0 },
  { key: 'first_order_bonus_coins', label: 'First order bonus coins', hint: 'Applied once after a qualifying order completes.', min: 0 },
  { key: 'referral_bonus_coins', label: 'Referral bonus coins', hint: 'Released after a referred customer qualifies.', min: 0 },
];

function coins(value: number | null | undefined): string {
  return Number.isSafeInteger(value) ? (value as number).toLocaleString('en-IN') : '—';
}

function rupeesFromPaise(paise: number | null | undefined): string {
  if (!Number.isSafeInteger(paise)) return '—';
  const amount = paise as number;
  const whole = Math.trunc(Math.abs(amount) / 100).toLocaleString('en-IN');
  const fraction = (Math.abs(amount) % 100).toString().padStart(2, '0');
  return `${amount < 0 ? '-' : ''}₹${whole}.${fraction}`;
}

function paiseToInput(paise: number): string {
  return `${Math.trunc(paise / 100)}.${(paise % 100).toString().padStart(2, '0')}`;
}

function parseRupees(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

function parseWhole(value: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
}

function ReportCard({ label, value, icon, note }: { label: string; value: string; icon: string; note?: string }) {
  return (
    <article className="stat-card loyalty-stat">
      <i className={`ph ${icon}`} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

export default function AdminLoyaltyPage() {
  const [settings, setSettings] = useState<LoyaltyAdminSettings | null>(null);
  const [minCartInput, setMinCartInput] = useState('0.00');
  const [reports, setReports] = useState<LoyaltyAdminReports | null>(null);
  const [restrictions, setRestrictions] = useState<LoyaltyRestrictions | null>(null);
  const [wallets, setWallets] = useState<LoyaltyAdminWallet[]>([]);
  const [wallet, setWallet] = useState<LoyaltyAdminWallet | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyAdminTransaction[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [adjustmentDirection, setAdjustmentDirection] = useState<'credit' | 'debit'>('credit');
  const [adjustmentCoins, setAdjustmentCoins] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const adjustmentReference = useRef('');
  const [newProductId, setNewProductId] = useState('');
  const [newCategoryKey, setNewCategoryKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadWallet = useCallback(async (customerId: number) => {
    const response = await adminApi.getLoyaltyWallet(customerId);
    if (!response.ok) throw new Error('Unable to load wallet.');
    setWallet(response.wallet);
    setTransactions(response.transactions || []);
    setSelectedCustomerId(customerId);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      adminApi.getLoyaltySettings(),
      adminApi.getLoyaltyReports(),
      adminApi.getLoyaltyRestrictions(),
    ]).then((results) => {
      if (!live) return;
      const [settingsResult, reportsResult, restrictionsResult] = results;
      if (settingsResult.status === 'fulfilled' && settingsResult.value.ok) {
        setSettings(settingsResult.value.settings);
        setMinCartInput(paiseToInput(settingsResult.value.settings.min_cart_paise));
      }
      if (reportsResult.status === 'fulfilled' && reportsResult.value.ok) setReports(reportsResult.value.reports);
      if (restrictionsResult.status === 'fulfilled' && restrictionsResult.value.ok) {
        setRestrictions({ products: restrictionsResult.value.products || [], categories: restrictionsResult.value.categories || [] });
      }
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') setNotice({ kind: 'error', text: failure.reason?.message || 'Some loyalty data could not be loaded.' });
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const minCartPaise = parseRupees(minCartInput);
    if (minCartPaise === null) {
      setNotice({ kind: 'error', text: 'Enter the minimum cart amount in rupees with up to two decimal places.' });
      return;
    }
    for (const field of settingFields) {
      if (parseWhole(String(settings[field.key]), field.min, field.max) === null) {
        setNotice({ kind: 'error', text: `${field.label} must be a whole number in the allowed range.` });
        return;
      }
    }
    setBusy('settings');
    try {
      const response = await adminApi.saveLoyaltySettings({ ...settings, min_cart_paise: minCartPaise });
      setSettings(response.settings);
      setMinCartInput(paiseToInput(response.settings.min_cart_paise));
      setNotice({ kind: 'success', text: 'Loyalty settings saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save settings.' });
    } finally {
      setBusy(null);
    }
  }

  async function searchWallets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('search');
    try {
      const response = await adminApi.getLoyaltyWallets(searchInput);
      setWallets(response.wallets || []);
      setSearchPerformed(true);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to search wallets.' });
    } finally {
      setBusy(null);
    }
  }

  async function selectWallet(customerId: number) {
    setBusy('wallet');
    try {
      await loadWallet(customerId);
      setAdjustmentCoins('');
      setAdjustmentReason('');
      adjustmentReference.current = '';
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load wallet.' });
    } finally {
      setBusy(null);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomerId) return;
    const count = parseWhole(adjustmentCoins, 1);
    if (count === null || adjustmentReason.trim().length < 3) {
      setNotice({ kind: 'error', text: 'Enter a positive whole coin amount and a reason of at least 3 characters.' });
      return;
    }
    if (!adjustmentReference.current) adjustmentReference.current = crypto.randomUUID();
    setBusy('adjustment');
    try {
      await adminApi.adjustLoyaltyWallet({
        customer_id: selectedCustomerId,
        coins: adjustmentDirection === 'credit' ? count : -count,
        reason: adjustmentReason.trim(),
        reference_id: adjustmentReference.current,
      });
      adjustmentReference.current = '';
      setAdjustmentCoins('');
      setAdjustmentReason('');
      setNotice({ kind: 'success', text: 'Adjustment recorded in the loyalty ledger.' });
      const [detail, report] = await Promise.allSettled([
        adminApi.getLoyaltyWallet(selectedCustomerId),
        adminApi.getLoyaltyReports(),
      ]);
      if (detail.status === 'fulfilled') {
        setWallet(detail.value.wallet);
        setTransactions(detail.value.transactions || []);
      }
      if (report.status === 'fulfilled') setReports(report.value.reports);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to adjust wallet. Retry with the same details.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveRestrictions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restrictions) return;
    const invalid = [...restrictions.products, ...restrictions.categories].some((row) =>
      !Number.isSafeInteger(row.multiplier) || row.multiplier < 0 || row.multiplier > 100
    );
    if (invalid) {
      setNotice({ kind: 'error', text: 'Each multiplier must be a whole number from 0 to 100.' });
      return;
    }
    setBusy('restrictions');
    try {
      const response = await adminApi.saveLoyaltyRestrictions(restrictions);
      setRestrictions({ products: response.products || [], categories: response.categories || [] });
      setNotice({ kind: 'success', text: 'Product and category loyalty rules saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save restrictions.' });
    } finally {
      setBusy(null);
    }
  }

  function addProductRestriction() {
    const id = parseWhole(newProductId, 1);
    if (id === null || !restrictions) return;
    if (restrictions.products.some((row) => row.product_id === id)) return;
    setRestrictions({ ...restrictions, products: [...restrictions.products, { product_id: id, earn_excluded: false, redeem_excluded: false, multiplier: 1 }] });
    setNewProductId('');
  }

  function addCategoryRestriction() {
    const key = newCategoryKey.trim();
    if (!key || !restrictions) return;
    if (restrictions.categories.some((row) => row.category_key === key)) return;
    setRestrictions({ ...restrictions, categories: [...restrictions.categories, { category_key: key, earn_excluded: false, redeem_excluded: false, multiplier: 1 }] });
    setNewCategoryKey('');
  }

  function updateProduct(id: number, patch: Partial<LoyaltyProductRestriction>) {
    setRestrictions((current) => current && ({ ...current, products: current.products.map((row) => row.product_id === id ? { ...row, ...patch } : row) }));
  }

  function updateCategory(key: string, patch: Partial<LoyaltyCategoryRestriction>) {
    setRestrictions((current) => current && ({ ...current, categories: current.categories.map((row) => row.category_key === key ? { ...row, ...patch } : row) }));
  }

  return (
    <div className="loyalty-admin">
      <div className="loyalty-intro">
        <p>Manage the loyalty wallet, review its financial liability, and set redemption controls.</p>
        <strong>₹100 eligible spend = 1 coin · 1 coin = 1 paise</strong>
      </div>

      {notice && <div role="alert" className={`admin-alert admin-alert--${notice.kind}`}>{notice.text}</div>}
      {loading && <p className="loyalty-muted">Loading loyalty administration…</p>}

      {reports && (
        <section aria-labelledby="loyalty-reports-heading">
          <div className="loyalty-section-heading"><h2 id="loyalty-reports-heading">Loyalty report</h2><p>Current ledger totals and outstanding coin liability.</p></div>
          <div className="admin-grid loyalty-reports-grid">
            <ReportCard label="Available liability" value={rupeesFromPaise(reports.available_coins)} icon="ph-wallet" note={`${coins(reports.available_coins)} coins`} />
            <ReportCard label="Pending coins" value={coins(reports.pending_coins)} icon="ph-hourglass" />
            <ReportCard label="Coins issued" value={coins(reports.total_coins_issued)} icon="ph-coins" />
            <ReportCard label="Coins redeemed" value={coins(reports.redeemed_coins)} icon="ph-check-circle" />
            <ReportCard label="Coins expired" value={coins(reports.expired_coins)} icon="ph-clock" />
            <ReportCard label="Coins reversed" value={coins(reports.reversed_coins)} icon="ph-arrow-counter-clockwise" />
            <ReportCard label="Customers using loyalty" value={coins(reports.customers_using_loyalty)} icon="ph-users" />
            <ReportCard label="Orders using loyalty" value={coins(reports.orders_using_loyalty)} icon="ph-receipt" />
            <ReportCard label="Loyalty discounts" value={rupeesFromPaise(reports.loyalty_discount_paise)} icon="ph-currency-inr" />
            <ReportCard label="Referral rewards" value={coins(reports.referral_rewards)} icon="ph-user-plus" />
            <ReportCard label="Promotional rewards" value={coins(reports.promotional_rewards)} icon="ph-gift" />
          </div>
        </section>
      )}

      {settings && (
        <section className="admin-card" aria-labelledby="loyalty-settings-heading">
          <div className="admin-card__head"><div><h2 id="loyalty-settings-heading">Loyalty settings</h2><p>The earning rate and coin value are fixed. Other limits apply to future activity.</p></div></div>
          <form className="admin-form admin-card__body" onSubmit={saveSettings}>
            <div className="loyalty-fixed-rules"><div><span>Spend to earn 1 coin</span><strong>₹100.00</strong></div><div><span>Value of 1 coin</span><strong>₹0.01</strong></div></div>
            <label className="loyalty-toggle"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>Enable loyalty earning and redemption</span></label>
            <div className="loyalty-form-grid">
              {settingFields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input type="number" inputMode="numeric" min={field.min} max={field.max} step="1" required value={settings[field.key]} onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })} />
                  <small>{field.hint}</small>
                </label>
              ))}
              <label><span>Minimum eligible cart amount (₹)</span><input type="text" inputMode="decimal" required value={minCartInput} onChange={(event) => setMinCartInput(event.target.value)} /><small>Stored as an integer amount in paise.</small></label>
            </div>
            <div><button className="admin-button admin-button--primary" type="submit" disabled={busy === 'settings'}>{busy === 'settings' ? 'Saving…' : 'Save loyalty settings'}</button></div>
          </form>
        </section>
      )}

      <section className="admin-card" aria-labelledby="loyalty-wallets-heading">
        <div className="admin-card__head"><div><h2 id="loyalty-wallets-heading">Customer wallets</h2><p>Search by customer name, email, or ID. Every adjustment creates a ledger record.</p></div></div>
        <div className="admin-card__body">
          <form className="loyalty-search" onSubmit={searchWallets}><input aria-label="Search loyalty customers" placeholder="Customer name, email, or ID" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><button className="admin-button admin-button--secondary" type="submit" disabled={busy === 'search'}>Search</button></form>
          {wallets.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Available</th><th>Pending</th><th>Reserved</th><th /></tr></thead><tbody>{wallets.map((row) => <tr key={row.customer_id}><td><strong>{row.customer_name || `Customer #${row.customer_id}`}</strong><br /><small>{row.customer_email || `ID ${row.customer_id}`}</small></td><td>{coins(row.available_coins)}</td><td>{coins(row.pending_coins)}</td><td>{coins(row.reserved_coins)}</td><td><button className="admin-button admin-button--ghost" type="button" onClick={() => selectWallet(row.customer_id)} disabled={busy === 'wallet'}>View wallet</button></td></tr>)}</tbody></table></div>}
          {searchPerformed && wallets.length === 0 && <p className="loyalty-muted">No matching wallets found.</p>}
          {wallet && <div className="loyalty-wallet-detail">
            <h3>{wallet.customer_name || `Customer #${wallet.customer_id}`}{wallet.customer_email && <small> · {wallet.customer_email}</small>}</h3>
            <div className="loyalty-wallet-grid">
              <div><span>Available</span><strong>{coins(wallet.available_coins)}</strong><small>{rupeesFromPaise(wallet.available_coins)}</small></div>
              <div><span>Pending</span><strong>{coins(wallet.pending_coins)}</strong></div>
              <div><span>Reserved</span><strong>{coins(wallet.reserved_coins)}</strong></div>
              <div><span>Lifetime earned</span><strong>{coins(wallet.lifetime_earned)}</strong></div>
              <div><span>Lifetime redeemed</span><strong>{coins(wallet.lifetime_redeemed)}</strong></div>
              <div><span>Expired / reversed</span><strong>{coins(wallet.lifetime_expired)} / {coins(wallet.lifetime_reversed)}</strong></div>
            </div>
            <form className="admin-form loyalty-adjustment" onSubmit={submitAdjustment}>
              <h4>Record an admin adjustment</h4>
              <div className="loyalty-form-grid loyalty-form-grid--adjustment">
                <label><span>Action</span><select value={adjustmentDirection} onChange={(event) => { setAdjustmentDirection(event.target.value as 'credit' | 'debit'); adjustmentReference.current = ''; }}><option value="credit">Add coins</option><option value="debit">Remove coins</option></select></label>
                <label><span>Coins</span><input type="number" min="1" step="1" required value={adjustmentCoins} onChange={(event) => { setAdjustmentCoins(event.target.value); adjustmentReference.current = ''; }} /></label>
                <label><span>Reason</span><input type="text" minLength={3} maxLength={500} required placeholder="Customer service compensation" value={adjustmentReason} onChange={(event) => { setAdjustmentReason(event.target.value); adjustmentReference.current = ''; }} /></label>
              </div>
              <div><button className="admin-button admin-button--primary" type="submit" disabled={busy === 'adjustment'}>{busy === 'adjustment' ? 'Recording…' : 'Record adjustment'}</button></div>
            </form>
            <h4>Transaction history</h4>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Transaction</th><th>Order</th><th>Coins</th><th>Value</th><th>Status</th></tr></thead><tbody>{transactions.length ? transactions.map((tx) => <tr key={tx.id}><td>{dateLabel(tx.created_at)}</td><td><strong>{tx.transaction_type.replaceAll('_', ' ')}</strong><br /><small>{tx.description || tx.reference_id}</small></td><td>{tx.order_id ? `#${tx.order_id}` : '—'}</td><td>{tx.direction === 'DEBIT' || tx.coins < 0 ? '-' : '+'}{coins(Math.abs(tx.coins))}</td><td>{rupeesFromPaise(Math.abs(tx.coins))}</td><td>{tx.status}</td></tr>) : <tr className="admin-table__empty"><td colSpan={6}>No loyalty transactions yet.</td></tr>}</tbody></table></div>
          </div>}
        </div>
      </section>

      {restrictions && <section className="admin-card" aria-labelledby="loyalty-restrictions-heading">
        <div className="admin-card__head"><div><h2 id="loyalty-restrictions-heading">Product and category rules</h2><p>Exclude earning or redemption, or set an integer earning multiplier.</p></div></div>
        <form className="admin-form admin-card__body" onSubmit={saveRestrictions}>
          <h3>Products</h3>
          <div className="loyalty-search"><input aria-label="Product ID" type="number" min="1" step="1" placeholder="Product ID" value={newProductId} onChange={(event) => setNewProductId(event.target.value)} /><button className="admin-button admin-button--secondary" type="button" onClick={addProductRestriction}>Add product</button></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product ID</th><th>Exclude earning</th><th>Exclude redemption</th><th>Earn multiplier</th><th /></tr></thead><tbody>{restrictions.products.length ? restrictions.products.map((row) => <tr key={row.product_id}><td>{row.product_id}</td><td><input type="checkbox" aria-label={`Exclude earning for product ${row.product_id}`} checked={row.earn_excluded} onChange={(event) => updateProduct(row.product_id, { earn_excluded: event.target.checked })} /></td><td><input type="checkbox" aria-label={`Exclude redemption for product ${row.product_id}`} checked={row.redeem_excluded} onChange={(event) => updateProduct(row.product_id, { redeem_excluded: event.target.checked })} /></td><td><input className="loyalty-multiplier" type="number" aria-label={`Earn multiplier for product ${row.product_id}`} min="0" max="100" step="1" value={row.multiplier} onChange={(event) => updateProduct(row.product_id, { multiplier: Number(event.target.value) })} /></td><td><button className="admin-button admin-button--ghost" type="button" onClick={() => setRestrictions({ ...restrictions, products: restrictions.products.filter((item) => item.product_id !== row.product_id) })}>Remove</button></td></tr>) : <tr className="admin-table__empty"><td colSpan={5}>No product overrides.</td></tr>}</tbody></table></div>
          <h3>Categories</h3>
          <div className="loyalty-search"><input aria-label="Category key" placeholder="Category key" value={newCategoryKey} onChange={(event) => setNewCategoryKey(event.target.value)} /><button className="admin-button admin-button--secondary" type="button" onClick={addCategoryRestriction}>Add category</button></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Category key</th><th>Exclude earning</th><th>Exclude redemption</th><th>Earn multiplier</th><th /></tr></thead><tbody>{restrictions.categories.length ? restrictions.categories.map((row) => <tr key={row.category_key}><td>{row.category_key}</td><td><input type="checkbox" aria-label={`Exclude earning for category ${row.category_key}`} checked={row.earn_excluded} onChange={(event) => updateCategory(row.category_key, { earn_excluded: event.target.checked })} /></td><td><input type="checkbox" aria-label={`Exclude redemption for category ${row.category_key}`} checked={row.redeem_excluded} onChange={(event) => updateCategory(row.category_key, { redeem_excluded: event.target.checked })} /></td><td><input className="loyalty-multiplier" type="number" aria-label={`Earn multiplier for category ${row.category_key}`} min="0" max="100" step="1" value={row.multiplier} onChange={(event) => updateCategory(row.category_key, { multiplier: Number(event.target.value) })} /></td><td><button className="admin-button admin-button--ghost" type="button" onClick={() => setRestrictions({ ...restrictions, categories: restrictions.categories.filter((item) => item.category_key !== row.category_key) })}>Remove</button></td></tr>) : <tr className="admin-table__empty"><td colSpan={5}>No category overrides.</td></tr>}</tbody></table></div>
          <div><button className="admin-button admin-button--primary" type="submit" disabled={busy === 'restrictions'}>{busy === 'restrictions' ? 'Saving…' : 'Save product and category rules'}</button></div>
        </form>
      </section>}
    </div>
  );
}

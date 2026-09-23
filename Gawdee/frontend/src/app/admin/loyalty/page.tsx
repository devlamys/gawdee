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
  type LoyaltyPackBonusRule,
  type LoyaltyRestrictions,
} from '@/lib/admin-api';
import type { CatalogItem } from '@/types';
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
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [packRules, setPackRules] = useState<LoyaltyPackBonusRule[]>([]);
  const [bonusVariantId, setBonusVariantId] = useState('');
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
      adminApi.catalogAdminItems(),
      adminApi.getLoyaltyPackBonuses(),
    ]).then((results) => {
      if (!live) return;
      const [settingsResult, reportsResult, restrictionsResult, catalogResult, packResult] = results;
      if (settingsResult.status === 'fulfilled' && settingsResult.value.ok) {
        setSettings(settingsResult.value.settings);
        setMinCartInput(paiseToInput(settingsResult.value.settings.min_cart_paise));
      }
      if (reportsResult.status === 'fulfilled' && reportsResult.value.ok) setReports(reportsResult.value.reports);
      if (restrictionsResult.status === 'fulfilled' && restrictionsResult.value.ok) {
        setRestrictions({ products: restrictionsResult.value.products || [], categories: restrictionsResult.value.categories || [] });
      }
      if (catalogResult.status === 'fulfilled' && catalogResult.value.ok) {
        setCatalogItems(catalogResult.value.items || []);
      }
      if (packResult.status === 'fulfilled' && packResult.value.ok) setPackRules(packResult.value.rules || []);
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
      !Number.isSafeInteger(row.multiplier) || row.multiplier < 1 || row.multiplier > 20
    );
    if (invalid) {
      setNotice({ kind: 'error', text: 'Each multiplier must be a whole number from 1 to 20.' });
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

  function productLabel(variantId: number): string {
    for (const item of catalogItems) {
      const variant = item.variants.find((entry) => entry.id === variantId);
      if (variant) return `${item.name} — ${variant.variantName}`;
    }
    return `Variant #${variantId}`;
  }

  function bonusFor(variantId: number, quantity: 1 | 2 | 3, plan: LoyaltyPackBonusRule['purchase_plan']): number {
    return packRules.find((rule) => rule.variant_id === variantId && rule.pack_quantity === quantity && rule.purchase_plan === plan)?.bonus_coins ?? 0;
  }

  function updatePackBonus(variantId: number, quantity: 1 | 2 | 3, plan: LoyaltyPackBonusRule['purchase_plan'], value: number) {
    setPackRules((current) => [
      ...current.filter((rule) => !(rule.variant_id === variantId && rule.pack_quantity === quantity && rule.purchase_plan === plan)),
      { variant_id: variantId, pack_quantity: quantity, purchase_plan: plan, bonus_coins: value },
    ]);
  }

  async function savePackBonuses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (packRules.some((rule) => !Number.isSafeInteger(rule.bonus_coins) || rule.bonus_coins < 0 || rule.bonus_coins > 1_000_000)) {
      setNotice({ kind: 'error', text: 'Bonus coins must be whole numbers from 0 to 1,000,000.' });
      return;
    }
    setBusy('pack-bonuses');
    try {
      const response = await adminApi.saveLoyaltyPackBonuses(packRules);
      setPackRules(response.rules || []);
      setNotice({ kind: 'success', text: 'Pack and purchase option bonuses saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save pack bonuses.' });
    } finally {
      setBusy(null);
    }
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
            {!!reports.balance_mismatch_count && <ReportCard label="Wallets needing review" value={coins(reports.balance_mismatch_count)} icon="ph-warning" note="Ledger and coin batches disagree" />}
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
            {wallet.balance_mismatch && (
              <p role="alert" style={{ padding: '1rem', borderRadius: '12px', background: '#fff4e8', color: '#8a3d14' }}>
                Wallet review required: recorded {coins(wallet.available_coins)} coins, ledger {coins(wallet.ledger_available_coins)}, spendable batches {coins(wallet.lot_available_coins)}. Customer can redeem {coins(wallet.spendable_coins)} coins. Resolve this mismatch before adjusting the wallet.
              </p>
            )}
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
          <div className="loyalty-search"><select aria-label="Choose product and variant" value={newProductId} onChange={(event) => setNewProductId(event.target.value)}><option value="">Choose product and variant</option>{catalogItems.map((item) => <optgroup key={item.id} label={item.name}>{item.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.variantName}{variant.isActive === 0 ? ' (inactive)' : ''}</option>)}</optgroup>)}</select><button className="admin-button admin-button--secondary" type="button" disabled={!newProductId} onClick={addProductRestriction}>Add product</button></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product / variant</th><th>Exclude earning</th><th>Exclude redemption</th><th>Earn multiplier</th><th /></tr></thead><tbody>{restrictions.products.length ? restrictions.products.map((row) => <tr key={row.product_id}><td>{productLabel(row.product_id)}</td><td><input type="checkbox" aria-label={`Exclude earning for ${productLabel(row.product_id)}`} checked={row.earn_excluded} onChange={(event) => updateProduct(row.product_id, { earn_excluded: event.target.checked })} /></td><td><input type="checkbox" aria-label={`Exclude redemption for ${productLabel(row.product_id)}`} checked={row.redeem_excluded} onChange={(event) => updateProduct(row.product_id, { redeem_excluded: event.target.checked })} /></td><td><input className="loyalty-multiplier" type="number" aria-label={`Earn multiplier for ${productLabel(row.product_id)}`} min="1" max="20" step="1" value={row.multiplier} onChange={(event) => updateProduct(row.product_id, { multiplier: Number(event.target.value) })} /></td><td><button className="admin-button admin-button--ghost" type="button" onClick={() => setRestrictions({ ...restrictions, products: restrictions.products.filter((item) => item.product_id !== row.product_id) })}>Remove</button></td></tr>) : <tr className="admin-table__empty"><td colSpan={5}>No product overrides.</td></tr>}</tbody></table></div>
          <h3>Categories</h3>
          <div className="loyalty-search"><input aria-label="Category key" placeholder="Category key" value={newCategoryKey} onChange={(event) => setNewCategoryKey(event.target.value)} /><button className="admin-button admin-button--secondary" type="button" onClick={addCategoryRestriction}>Add category</button></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Category key</th><th>Exclude earning</th><th>Exclude redemption</th><th>Earn multiplier</th><th /></tr></thead><tbody>{restrictions.categories.length ? restrictions.categories.map((row) => <tr key={row.category_key}><td>{row.category_key}</td><td><input type="checkbox" aria-label={`Exclude earning for category ${row.category_key}`} checked={row.earn_excluded} onChange={(event) => updateCategory(row.category_key, { earn_excluded: event.target.checked })} /></td><td><input type="checkbox" aria-label={`Exclude redemption for category ${row.category_key}`} checked={row.redeem_excluded} onChange={(event) => updateCategory(row.category_key, { redeem_excluded: event.target.checked })} /></td><td><input className="loyalty-multiplier" type="number" aria-label={`Earn multiplier for category ${row.category_key}`} min="1" max="20" step="1" value={row.multiplier} onChange={(event) => updateCategory(row.category_key, { multiplier: Number(event.target.value) })} /></td><td><button className="admin-button admin-button--ghost" type="button" onClick={() => setRestrictions({ ...restrictions, categories: restrictions.categories.filter((item) => item.category_key !== row.category_key) })}>Remove</button></td></tr>) : <tr className="admin-table__empty"><td colSpan={5}>No category overrides.</td></tr>}</tbody></table></div>
          <div><button className="admin-button admin-button--primary" type="submit" disabled={busy === 'restrictions'}>{busy === 'restrictions' ? 'Saving…' : 'Save product and category rules'}</button></div>
        </form>
      </section>}

      <section className="admin-card" aria-labelledby="loyalty-pack-heading">
        <div className="admin-card__head"><div><h2 id="loyalty-pack-heading">Pack and purchase option coins</h2><p>Set bonus coins for each pack size and purchase preference. Base earning of 1 coin per complete ₹100 eligible spend is added automatically.</p></div></div>
        <div className="admin-card__body">

          {/* ── Overview table: all variants with any bonus configured ── */}
          {(() => {
            const configuredVariantIds = [...new Set(packRules.filter((r) => r.bonus_coins > 0).map((r) => r.variant_id))];
            if (!configuredVariantIds.length) return <p className="loyalty-muted">No pack bonuses configured yet. Use the editor below to add them.</p>;
            function packSummary(variantId: number, quantity: 1 | 2 | 3): string {
              const o = bonusFor(variantId, quantity, 'one_time');
              const m = bonusFor(variantId, quantity, 'monthly');
              const t = bonusFor(variantId, quantity, 'two_months');
              return `${o} / ${m} / ${t}`;
            }
            return (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#333' }}>Configured variants</h3>
                <div className="admin-table-wrap" style={{ marginBottom: '2rem' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Product / Variant</th>
                        <th title="One-time / Monthly / Every 2 months">1-Pack<br/><small style={{fontWeight:400,color:'#888'}}>1× / mo / 2mo</small></th>
                        <th title="One-time / Monthly / Every 2 months">2-Pack<br/><small style={{fontWeight:400,color:'#888'}}>1× / mo / 2mo</small></th>
                        <th title="One-time / Monthly / Every 2 months">3-Pack<br/><small style={{fontWeight:400,color:'#888'}}>1× / mo / 2mo</small></th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {configuredVariantIds.map((variantId) => (
                        <tr key={variantId} style={Number(bonusVariantId) === variantId ? { background: '#f0f9f7' } : undefined}>
                          <td><strong>{productLabel(variantId)}</strong></td>
                          <td>{packSummary(variantId, 1)}</td>
                          <td>{packSummary(variantId, 2)}</td>
                          <td>{packSummary(variantId, 3)}</td>
                          <td>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              onClick={() => {
                                setBonusVariantId(String(variantId));
                                document.getElementById('loyalty-pack-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              {Number(bonusVariantId) === variantId ? '✓ Editing' : 'Edit'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ── Editor: select a variant and set its pack bonuses ── */}
          <form id="loyalty-pack-editor" className="admin-form" onSubmit={savePackBonuses}>
            <label className="loyalty-pack-picker">
              <span>Select product and variant to configure</span>
              <select value={bonusVariantId} onChange={(event) => setBonusVariantId(event.target.value)}>
                <option value="">Choose a product and variant</option>
                {catalogItems.map((item) => (
                  <optgroup key={item.id} label={item.name}>
                    {item.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.variantName}{variant.isActive === 0 ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {bonusVariantId && (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.5rem' }}>
                  Editing: <strong>{productLabel(Number(bonusVariantId))}</strong> — enter bonus coins for each pack size and purchase plan. 0 = no bonus.
                </p>
                <div className="admin-table-wrap">
                  <table className="admin-table loyalty-pack-table">
                    <thead>
                      <tr>
                        <th>Pack size</th>
                        <th>One-time bonus</th>
                        <th>Every month bonus</th>
                        <th>Every 2 months bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([1, 2, 3] as const).map((quantity) => (
                        <tr key={quantity}>
                          <th scope="row">{quantity}-pack</th>
                          {(['one_time', 'monthly', 'two_months'] as const).map((plan) => (
                            <td key={plan}>
                              <input
                                type="number" min="0" max="1000000" step="1"
                                aria-label={`${quantity}-pack ${plan.replaceAll('_', ' ')} bonus coins`}
                                value={bonusFor(Number(bonusVariantId), quantity, plan)}
                                onChange={(event) => updatePackBonus(Number(bonusVariantId), quantity, plan, Number(event.target.value))}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <small>0 means no pack bonus. Coins are awarded only for paid orders, then released after delivery and the return window. An order of more than 3 packs earns the normal base coins without a pack bonus.</small>
            <div><button className="admin-button admin-button--primary" type="submit" disabled={busy === 'pack-bonuses'}>{busy === 'pack-bonuses' ? 'Saving…' : 'Save pack coin rules'}</button></div>
          </form>
        </div>
      </section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { formatCoins, formatPaise } from '@/lib/loyalty';
import { LoyaltyTransaction, LoyaltyWallet } from '@/types';

const cardStyle = { background: '#fff', border: '1px solid #e8ece9', borderRadius: '16px', padding: '1.5rem' };

function displayDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function transactionLabel(transaction: LoyaltyTransaction): string {
  if (transaction.description) return transaction.description;
  return transaction.transaction_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function LoyaltyPage() {
  const router = useRouter();
  const { customer, loading: authLoading } = useAuth();
  const [wallet, setWallet] = useState<LoyaltyWallet | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [loadedCustomerId, setLoadedCustomerId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !customer) router.replace('/login?return=/account/loyalty');
  }, [authLoading, customer, router]);

  const customerId = customer?.id;

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    Promise.all([api.loyalty.getWallet(), api.loyalty.getTransactions()])
      .then(([walletResult, historyResult]) => {
        if (cancelled) return;
        setError('');
        setWallet(walletResult.wallet);
        setTransactions(historyResult.transactions || []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load Loyalty Coins.');
      })
      .finally(() => { if (!cancelled) setLoadedCustomerId(customerId); });
    return () => { cancelled = true; };
  }, [customerId]);

  if (authLoading || !customer || loadedCustomerId !== customer.id) {
    return <div className="container" style={{ padding: '5rem 0', textAlign: 'center', color: '#666' }}>Loading your Loyalty Wallet…</div>;
  }

  if (error || !wallet) {
    return (
      <div className="container" style={{ padding: '5rem 0', textAlign: 'center' }}>
        <h1>Loyalty Wallet</h1>
        <p role="alert">{error || 'Your wallet is unavailable right now.'}</p>
        <Link href="/account" style={{ color: '#009a84' }}>Back to account</Link>
      </div>
    );
  }

  const metrics = [
    { label: 'Available Coins', value: formatCoins(wallet.available_coins), sub: formatPaise(wallet.equivalent_paise) },
    { label: 'Pending Coins', value: formatCoins(wallet.pending_coins), sub: 'Available after the return period' },
    { label: 'Reserved Coins', value: formatCoins(wallet.reserved_coins), sub: 'Held for checkout' },
    { label: 'Expiring Soon', value: formatCoins(wallet.expiring_soon_coins), sub: formatPaise(wallet.expiring_soon_coins) },
    { label: 'Lifetime Earned', value: formatCoins(wallet.lifetime_earned), sub: 'All rewards earned' },
    { label: 'Lifetime Redeemed', value: formatCoins(wallet.lifetime_redeemed), sub: formatPaise(wallet.lifetime_redeemed) },
    { label: 'Lifetime Expired', value: formatCoins(wallet.lifetime_expired), sub: 'Expired rewards' },
    { label: 'Lifetime Reversed', value: formatCoins(wallet.lifetime_reversed), sub: 'Refund adjustments' },
  ];
  const expiringSoon = wallet.expiring_soon_coins ?? 0;
  const pendingCoins = wallet.pending_coins ?? 0;
  const availableCoins = wallet.available_coins ?? 0;

  return (
    <main className="container" style={{ padding: '3rem 0 6rem' }}>
      <Link href="/account" style={{ color: '#009a84', fontSize: '0.9rem' }}>← Back to My Account</Link>

      <div style={{ margin: '1.25rem 0 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ color: '#009a84', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>My Rewards</span>
            <h1 style={{ fontSize: '2.3rem', margin: '0.3rem 0 0.45rem' }}>Loyalty Wallet</h1>
            <p style={{ color: '#666', margin: 0 }}>Earn 1 coin for every complete ₹100 of eligible products. Each coin is worth ₹0.01 at checkout.</p>
          </div>
          <Link
            href="/products"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.8rem 1.2rem',
              borderRadius: '999px',
              background: '#0f8869',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              boxShadow: '0 12px 24px rgba(15, 136, 105, 0.2)',
            }}
          >
            Shop to earn more
          </Link>
        </div>
      </div>

      <section style={{
        background: 'linear-gradient(135deg, #f3fbf8 0%, #ebfff7 100%)',
        border: '1px solid #cfeadf',
        borderRadius: '24px',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 16px 38px rgba(16, 108, 85, 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ display: 'block', color: '#0b5d4b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem' }}>Available balance</span>
            <div style={{ fontSize: '2.7rem', lineHeight: 1.1, fontWeight: 800, color: '#0d6f59', marginTop: '0.45rem' }}>
              {formatCoins(availableCoins)}
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#4a695f', marginLeft: '0.4rem' }}>coins</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4d625b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Value today</div>
            <div style={{ fontSize: '1.3rem', color: '#0e5f4e', fontWeight: 800 }}>{formatPaise(wallet.equivalent_paise)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem', marginTop: '1.25rem' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '0.9rem 1rem', border: '1px solid #dfeee6' }}>
            <div style={{ color: '#6b7a75', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Pending</div>
            <strong style={{ color: '#1d3d36', fontSize: '1.25rem' }}>{formatCoins(pendingCoins)}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '0.9rem 1rem', border: '1px solid #dfeee6' }}>
            <div style={{ color: '#6b7a75', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Reserved</div>
            <strong style={{ color: '#1d3d36', fontSize: '1.25rem' }}>{formatCoins(wallet.reserved_coins)}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '0.9rem 1rem', border: '1px solid #dfeee6' }}>
            <div style={{ color: '#6b7a75', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Expiring soon</div>
            <strong style={{ color: '#1d3d36', fontSize: '1.25rem' }}>{formatCoins(expiringSoon)}</strong>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#edf9f5', border: '1px solid #bfe4d8', borderRadius: '16px', padding: '1rem 1.2rem', color: '#0a5d49' }}>
          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>How redemption works</strong>
          <div style={{ lineHeight: 1.6 }}>
            <div>1 coin = ₹0.01. Available coins can be used during checkout, while pending coins remain locked until the return window ends.</div>
            <div style={{ marginTop: '0.35rem' }}>Your maximum discount is calculated by the server based on your eligible cart value, wallet balance, and current redemption limits.</div>
          </div>
        </div>

        {expiringSoon > 0 ? (
          <div style={{ background: '#fff7e8', border: '1px solid #f0cf88', borderRadius: '16px', padding: '1rem 1.2rem', color: '#7a4d00' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Expiry warning</strong>
            <div>{formatCoins(expiringSoon)} coins are expiring soon. Use them before they expire so you do not lose value on your wallet.</div>
          </div>
        ) : (
          <div style={{ background: '#f6faf8', border: '1px solid #dfece7', borderRadius: '16px', padding: '1rem 1.2rem', color: '#1c5c4d' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>No expiry warning</strong>
            <div>You currently have no coins nearing expiry. Keep shopping to build more rewards.</div>
          </div>
        )}

        {pendingCoins > 0 && (
          <div style={{ background: '#f5f7ff', border: '1px solid #d7defd', borderRadius: '16px', padding: '1rem 1.2rem', color: '#2d3a8c' }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Pending rewards</strong>
            <div>{formatCoins(pendingCoins)} coins are currently pending and will become available after the order return window closes.</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        {metrics.map((metric) => (
          <div key={metric.label} style={cardStyle}>
            <span style={{ display: 'block', color: '#666', fontSize: '0.85rem' }}>{metric.label}</span>
            <strong style={{ display: 'block', fontSize: '1.8rem', color: '#007e6f', margin: '0.4rem 0' }}>{metric.value}</strong>
            <small style={{ color: '#666' }}>{metric.sub}</small>
          </div>
        ))}
      </div>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Transaction History</h2>
          <span style={{ color: '#666', fontSize: '0.82rem' }}>{transactions.length} entries</span>
        </div>

        {transactions.length === 0 ? (
          <p style={{ color: '#666', margin: 0 }}>No loyalty transactions yet. Your rewards will appear here after an eligible purchase.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666', fontSize: '0.85rem' }}>
                  <th scope="col" style={{ padding: '0.8rem' }}>Date</th>
                  <th scope="col" style={{ padding: '0.8rem' }}>Transaction</th>
                  <th scope="col" style={{ padding: '0.8rem' }}>Coins / Value</th>
                  <th scope="col" style={{ padding: '0.8rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => {
                  const signed = transaction.direction?.toUpperCase() === 'DEBIT' ? '−' : transaction.direction?.toUpperCase() === 'CREDIT' ? '+' : transaction.coins >= 0 ? '+' : '−';
                  const absolute = Math.abs(transaction.coins);
                  return (
                    <tr key={transaction.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.8rem', whiteSpace: 'nowrap' }}>{displayDate(transaction.created_at)}</td>
                      <td style={{ padding: '0.8rem' }}>
                        <strong>{transactionLabel(transaction)}</strong>
                        {transaction.order_number && <span style={{ display: 'block', color: '#666', fontSize: '0.8rem' }}>Order {transaction.order_number}</span>}
                        {transaction.expires_at && transaction.status === 'AVAILABLE' && <span style={{ display: 'block', color: '#666', fontSize: '0.8rem' }}>Expires {displayDate(transaction.expires_at)}</span>}
                      </td>
                      <td style={{ padding: '0.8rem', color: signed === '+' ? '#007e6f' : '#a63c32', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {signed}{formatCoins(absolute)} <span style={{ display: 'block', color: '#666', fontWeight: 400, fontSize: '0.8rem' }}>{formatPaise(absolute)}</span>
                      </td>
                      <td style={{ padding: '0.8rem', textTransform: 'capitalize' }}>{transaction.status.toLowerCase()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WalletPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/account/loyalty');
  }, [router]);

  return (
    <main className="container" style={{ padding: '4rem 0 6rem', textAlign: 'center', color: '#666' }}>
      Redirecting to your Loyalty Wallet…
    </main>
  );
}

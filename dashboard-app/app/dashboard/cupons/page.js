'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CustomerCouponsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/beneficios#loyalty-past-coupons');
  }, [router]);
  return <div className="section-shell orders-showcase customer-coupons-showcase" role="status" aria-live="polite">
    <p>Redirecionando para seus cupons em Benefícios...</p>
  </div>;
}

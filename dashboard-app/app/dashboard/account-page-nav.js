'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleDollarSign, MapPin, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

const accountPages = [
  { id: 'budget', badgeId: 'budget', label: 'Orçamento', href: '/dashboard/budget', icon: CircleDollarSign },
  { id: 'profile', badgeId: 'profile', label: 'Meu perfil', href: '/dashboard/profile', icon: UserRound },
  { id: 'addresses', badgeId: 'addresses', label: 'Meus endereços', href: '/dashboard/addresses', icon: MapPin },
];

export default function AccountPageNav({ current }) {
  const router = useRouter();
  const [dismissedBadges, setDismissedBadges] = useState([]);
  const [badgeError, setBadgeError] = useState('');
  const [savingBadge, setSavingBadge] = useState(false);

  useEffect(() => {
    let active = true;
    const handleBadgeDismissed = (event) => {
      const badgeIds = Array.isArray(event.detail?.dismissedBadges) ? event.detail.dismissedBadges : [];
      setDismissedBadges((current) => [...new Set([...current, ...badgeIds])]);
    };
    window.addEventListener('dashboard-badges-dismissed', handleBadgeDismissed);
    fetch('/api/customer-onboarding', { cache: 'no-store', credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as novidades.');
        if (!Array.isArray(data.dismissedBadges)) throw new Error('A resposta das novidades está inválida.');
        if (active) {
          setDismissedBadges((current) => [...new Set([...current, ...data.dismissedBadges])]);
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('Não foi possível carregar os selos de novidades da conta:', error);
        setBadgeError('Os selos de novidade ainda não foram sincronizados.');
      });
    return () => {
      active = false;
      window.removeEventListener('dashboard-badges-dismissed', handleBadgeDismissed);
    };
  }, []);

  const openAccountPage = async (event, href, badgeId) => {
    if (dismissedBadges.includes(badgeId)) return;
    event.preventDefault();
    if (savingBadge) {
      setBadgeError('Aguarde a sincronização da novidade antes de abrir outra seção.');
      return;
    }

    setSavingBadge(true);
    setBadgeError('');
    try {
      const response = await fetch('/api/customer-onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar esta alteração.');
      if (!Array.isArray(data.dismissedBadges)) throw new Error('A resposta das novidades está inválida.');
      setDismissedBadges(data.dismissedBadges);
      window.dispatchEvent(new CustomEvent('dashboard-badges-dismissed', { detail: data }));
      router.push(href);
    } catch (error) {
      console.error('Não foi possível salvar a novidade visualizada na conta:', error);
      setBadgeError(error.message || 'Não foi possível salvar esta alteração. Tente novamente.');
    } finally {
      setSavingBadge(false);
    }
  };

  return (
    <nav className="dashboard-account-nav" aria-label="Páginas da minha conta">
      {badgeError && <span className="dashboard-account-nav-error" role="status">{badgeError}</span>}
      {accountPages.map(({ id, badgeId, label, href, icon: Icon }) => {
        const showBadge = !dismissedBadges.includes(badgeId);
        return (
          <Link
            key={id}
            href={href}
            className={id === current ? 'active' : ''}
            aria-current={id === current ? 'page' : undefined}
            onClick={(event) => openAccountPage(event, href, badgeId)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
            {showBadge && <span className="dashboard-account-nav-badge">Novo</span>}
          </Link>
        );
      })}
    </nav>
  );
}

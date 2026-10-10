import Link from 'next/link';
import { CircleDollarSign, MapPin, UserRound } from 'lucide-react';

const accountPages = [
  { id: 'budget', label: 'Orçamento', href: '/dashboard/budget', icon: CircleDollarSign },
  { id: 'profile', label: 'Meu perfil', href: '/dashboard/profile', icon: UserRound },
  { id: 'addresses', label: 'Meus endereços', href: '/dashboard/addresses', icon: MapPin },
];

export default function AccountPageNav({ current }) {
  return (
    <nav className="dashboard-account-nav" aria-label="Páginas da minha conta">
      {accountPages.map(({ id, label, href, icon: Icon }) => (
        <Link
          key={id}
          href={href}
          className={id === current ? 'active' : ''}
          aria-current={id === current ? 'page' : undefined}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { Camera, CircleDollarSign, Heart, Package, ShoppingCart, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatCurrency, getBudgetProgress, getCurrentMonthSpend } from '../budget';
import { readLocalBudget } from '../budget-storage';
import { getCartItemCount } from '../cart-utils';

const emptyProfile = {
  fullName: '',
  email: '',
  whatsapp: '',
  cpf: '',
  gender: 'nao_informar',
  birthDate: '',
  memberSince: '',
  photo: null,
  googlePhoto: '',
  monthlyBudget: 0,
};

function readCompressedPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Não foi possível preparar esta imagem.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const photoInputRef = useRef(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [orders, setOrders] = useState([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    setLoading(true);
    setProfileLoaded(false);
    setFeedback('');
    Promise.all([
      fetch('/api/profile', { cache: 'no-store' }),
      fetch('/api/my/orders', { cache: 'no-store' }),
      fetch('/api/favorites', { cache: 'no-store' }),
      fetch('/api/cart', { cache: 'no-store' }),
    ])
      .then(async ([profileResponse, ordersResponse, favoritesResponse, cartResponse]) => {
        const profileData = await profileResponse.json();
        if (!profileResponse.ok || !profileData?.profile) {
          throw new Error(profileData.error || 'Não foi possível carregar os dados do perfil.');
        }
        if (!active) return null;

        const localBudget = readLocalBudget(session?.user?.email);
        setProfile({
          ...emptyProfile,
          ...profileData.profile,
          monthlyBudget: localBudget ?? profileData.profile.monthlyBudget ?? 0,
        });
        setProfileLoaded(true);

        if (!ordersResponse.ok || !favoritesResponse.ok || !cartResponse.ok) {
          throw new Error('Não foi possível carregar pedidos, favoritos ou carrinho.');
        }
        return Promise.all([
          ordersResponse.json(),
          favoritesResponse.json(),
          cartResponse.json(),
        ]);
      })
      .then((data) => {
        if (!active || !data) return;
        const [orderData, favoriteData, cartData] = data;
        setOrders(orderData.orders || []);
        setFavoritesCount((favoriteData.favorites || []).length);
        setCartCount(getCartItemCount(cartData.cart));
      })
      .catch((error) => {
        if (active) setFeedback(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [status, session?.user?.email]);

  useEffect(() => {
    const updateBudget = () => {
      const budget = readLocalBudget(session?.user?.email);
      if (budget !== null) setProfile((current) => ({ ...current, monthlyBudget: budget }));
    };
    updateBudget();
    window.addEventListener('dashboard-budget-updated', updateBudget);
    window.addEventListener('storage', updateBudget);
    return () => {
      window.removeEventListener('dashboard-budget-updated', updateBudget);
      window.removeEventListener('storage', updateBudget);
    };
  }, [session?.user?.email]);

  const persistProfile = async (updates) => {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível salvar seu perfil.');
    setProfile({ ...emptyProfile, ...data.profile });
    window.dispatchEvent(new CustomEvent('dashboard-profile-updated', { detail: data.profile }));
    return data.profile;
  };

  const handleChange = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async () => {
    if (!profileLoaded) {
      setFeedback('Aguarde o carregamento dos dados do perfil antes de salvar.');
      return;
    }
    setSavingProfile(true);
    setFeedback('');
    if (!profile.fullName.trim()) {
      setFeedback('Informe seu nome completo.');
      setSavingProfile(false);
      return;
    }
    if (profile.cpf && profile.cpf.replace(/\D/g, '').length !== 11) {
      setFeedback('Digite um CPF válido com 11 dígitos.');
      setSavingProfile(false);
      return;
    }
    try {
      await persistProfile({
        fullName: profile.fullName,
        whatsapp: profile.whatsapp,
        cpf: profile.cpf.replace(/\D/g, ''),
        gender: profile.gender,
        birthDate: profile.birthDate,
      });
      setFeedback('Informações atualizadas com sucesso.');
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!profileLoaded) {
      setFeedback('Aguarde o carregamento dos dados do perfil antes de alterar a foto.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setFeedback('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedback('A imagem original precisa ter no máximo 10 MB.');
      return;
    }
    setSavingPhoto(true);
    setFeedback('');
    try {
      const photo = await readCompressedPhoto(file);
      await persistProfile({ photo });
      setFeedback('Foto de perfil atualizada.');
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSavingPhoto(false);
    }
  };

  const resetPhoto = async () => {
    if (!profileLoaded) return;
    setSavingPhoto(true);
    try {
      await persistProfile({ photo: null });
      setFeedback('Foto do Google restaurada.');
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSavingPhoto(false);
    }
  };

  const memberSince = profile.memberSince
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(profile.memberSince))
    : '—';
  const photoUrl = profile.photo || profile.googlePhoto || session?.user?.image;
  const monthlyOrders = orders.filter((order) => {
    const date = new Date(order.createdAt);
    if (!Number.isNaN(date.getTime())) {
      const now = new Date();
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(order.createdAt || ''));
    if (!match) return false;
    const now = new Date();
    return Number(match[3]) === now.getFullYear() && Number(match[2]) - 1 === now.getMonth();
  });
  const monthSpend = getCurrentMonthSpend(orders);
  const budgetProgress = getBudgetProgress(monthSpend, profile.monthlyBudget);

  return (
    <div className="section-shell">
      <div className="section-header">
        <div>
          <h1>Meu Perfil</h1>
          <p>Gerencie suas informações pessoais</p>
        </div>
      </div>

      <div className="profile-shell">
        <div className="profile-picture-box">
          <h3>Foto do Perfil</h3>
          <p>Usamos sua foto do Google. Você pode escolher outra quando quiser.</p>
          <div className="photo-placeholder">
            {photoUrl ? <img src={photoUrl} alt="Foto do perfil" /> : <UserRound size={38} />}
          </div>
          <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={changePhoto} />
          <button type="button" className="secondary-cta full-width profile-photo-button" disabled={savingPhoto || loading || !profileLoaded} onClick={() => photoInputRef.current?.click()}>
            <Camera size={16} /> {savingPhoto ? 'Salvando foto...' : 'Alterar Foto'}
          </button>
          {profile.photo && <button type="button" className="profile-reset-photo" disabled={savingPhoto || !profileLoaded} onClick={resetPhoto}>Usar foto do Google</button>}
        </div>

        <div className="profile-form-box">
          <div className="panel-header no-gap">
            <h3>Informações Pessoais</h3>
            <span className="profile-edit-hint">Os dados pessoais podem ser alterados</span>
          </div>

          <div className="profile-form-grid">
            <label className="form-field">
              <span>Nome Completo</span>
              <input type="text" value={profile.fullName} disabled={loading || savingProfile || !profileLoaded} onChange={(event) => handleChange('fullName', event.target.value)} maxLength={100} />
            </label>
            <label className="form-field">
              <span>E-mail</span>
              <input type="email" value={profile.email || session?.user?.email || ''} readOnly />
            </label>
            <label className="form-field">
              <span>WhatsApp</span>
              <input type="tel" value={profile.whatsapp} disabled={loading || savingProfile || !profileLoaded} onChange={(event) => handleChange('whatsapp', event.target.value)} maxLength={30} />
            </label>
            <label className="form-field">
              <span>CPF</span>
              <input
                type="text"
                value={profile.cpf}
                placeholder="Digite seu CPF"
                disabled={loading || savingProfile || !profileLoaded}
                maxLength={14}
                inputMode="numeric"
                onChange={(event) => handleChange('cpf', event.target.value.replace(/\D/g, '').slice(0, 11))}
              />
            </label>
            <label className="form-field">
              <span>Gênero (opcional)</span>
              <select value={profile.gender} disabled={loading || savingProfile || !profileLoaded} onChange={(event) => handleChange('gender', event.target.value)}>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao_informar">Desejo não informar</option>
              </select>
            </label>
            <label className="form-field">
              <span>Data de nascimento (opcional)</span>
              <input type="date" value={profile.birthDate || ''} disabled={loading || savingProfile || !profileLoaded} onChange={(event) => handleChange('birthDate', event.target.value)} />
            </label>
            <label className="form-field">
              <span>Membro desde <small className="fixed-field-label">inalterável</small></span>
              <input type="text" value={loading ? 'Carregando...' : memberSince} readOnly />
            </label>
          </div>

          <p className="analytics-source-note">Gênero e data de nascimento são opcionais e usados apenas para estatísticas agregadas de compras.</p>
          <div className="profile-save-actions">
            <button type="button" className="primary-cta" disabled={loading || savingProfile || !profileLoaded} onClick={saveProfile}>{savingProfile ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
          {feedback && <p className={`profile-feedback ${feedback.includes('Não foi') || feedback.includes('Informe') || feedback.includes('Digite') || feedback.includes('Selecione') || feedback.includes('data de nascimento') ? 'error' : ''}`} role="status">{feedback}</p>}
        </div>
      </div>

      <div className="stats-panel-home profile-stats">
        <div className="metric-mini"><div className="metric-mini-icon"><Package size={18} /></div><div className="metric-mini-value">{monthlyOrders.length}</div><div className="metric-mini-label">Pedidos no mês</div><div className="metric-mini-detail">pedidos realizados este mês</div></div>
        <div className="metric-mini budget-metric">
          <div className="metric-mini-icon"><CircleDollarSign size={18} /></div>
          <div className="metric-mini-value">{profile.monthlyBudget ? formatCurrency(profile.monthlyBudget) : 'Não definido'}</div>
          <div className="metric-mini-label">Orçamento do mês</div>
          <div className="metric-mini-detail">{formatCurrency(monthSpend)} gastos neste mês</div>
          <div className="budget-meter" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(budgetProgress)}>
            <span className={budgetProgress >= 80 ? 'near-limit' : ''} style={{ width: `${budgetProgress}%` }} />
          </div>
          <Link className="budget-edit-link" href="/dashboard/budget">Definir orçamento</Link>
        </div>
        <div className="metric-mini"><div className="metric-mini-icon"><Heart size={18} /></div><div className="metric-mini-value">{favoritesCount}</div><div className="metric-mini-label">Produtos favoritos</div><div className="metric-mini-detail">itens salvos</div></div>
        <div className="metric-mini"><div className="metric-mini-icon"><ShoppingCart size={18} /></div><div className="metric-mini-value">{cartCount}</div><div className="metric-mini-label">Itens no carrinho</div><div className="metric-mini-detail">quantidade atual</div></div>
      </div>
    </div>
  );
}

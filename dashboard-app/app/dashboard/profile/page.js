'use client';

import { PencilLine } from 'lucide-react';
import { useState } from 'react';

const initialProfile = {
  fullName: 'Usuário Google',
  email: 'usuario@gmail.com',
  whatsapp: '(11) 99999-9999',
  cpf: '',
  memberSince: '14/01/2024',
};

function maskCpf(cpf) {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [cpfLocked, setCpfLocked] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleChange = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = () => {
    if (profile.cpf && profile.cpf.replace(/\D/g, '').length !== 11) {
      setFeedback('Digite um CPF válido com 11 dígitos.');
      return;
    }

    if (profile.cpf) {
      setProfile((current) => ({ ...current, cpf: current.cpf.replace(/\D/g, '') }));
      setCpfLocked(true);
    }
    setIsEditing(false);
    setFeedback('Informações atualizadas com sucesso.');
  };

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
          <p>Sua foto de perfil aparece em todo o site.</p>
          <div className="photo-placeholder">U</div>
          <button type="button" className="secondary-cta full-width">Alterar Foto</button>
        </div>

        <div className="profile-form-box">
          <div className="panel-header no-gap">
            <h3>Informações Pessoais</h3>
            <button type="button" className="secondary-cta small-cta" onClick={() => setIsEditing((value) => !value)}>
              {isEditing ? 'Cancelar' : 'Editar'}
            </button>
          </div>

          <div className="profile-form-grid">
            <label className="form-field">
              <span>Nome Completo</span>
              <input type="text" value={profile.fullName} readOnly={!isEditing} onChange={(e) => handleChange('fullName', e.target.value)} />
            </label>
            <label className="form-field">
              <span>E-mail</span>
              <input type="email" value={profile.email} readOnly={!isEditing} onChange={(e) => handleChange('email', e.target.value)} />
            </label>
            <label className="form-field">
              <span>WhatsApp</span>
              <input type="tel" value={profile.whatsapp} readOnly={!isEditing} onChange={(e) => handleChange('whatsapp', e.target.value)} />
            </label>
            <label className="form-field">
              <span>CPF {cpfLocked && <small className="fixed-field-label">fixo</small>}</span>
              <input
                type="text"
                value={cpfLocked ? maskCpf(profile.cpf) : profile.cpf}
                placeholder="Digite seu CPF"
                readOnly={cpfLocked || !isEditing}
                maxLength={11}
                inputMode="numeric"
                onChange={(e) => handleChange('cpf', e.target.value.replace(/\D/g, '').slice(0, 11))}
              />
            </label>
            <label className="form-field">
              <span>Membro desde</span>
              <input type="text" value={profile.memberSince} readOnly={!isEditing} onChange={(e) => handleChange('memberSince', e.target.value)} />
            </label>
          </div>

          {isEditing && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="primary-cta" onClick={saveProfile}>Salvar alterações</button>
            </div>
          )}
          {feedback && <p className="profile-feedback">{feedback}</p>}
        </div>
      </div>

      <div className="stats-panel-home profile-stats">
        <div className="metric-mini"><div className="metric-mini-icon"><PencilLine size={18} /></div><div className="metric-mini-value">24</div><div className="metric-mini-label">Pedidos Realizados</div><div className="metric-mini-detail">este mês</div></div>
        <div className="metric-mini"><div className="metric-mini-icon"><PencilLine size={18} /></div><div className="metric-mini-value">R$ 2.847</div><div className="metric-mini-label">Total Gasto</div><div className="metric-mini-detail">em 2024</div></div>
        <div className="metric-mini"><div className="metric-mini-icon"><PencilLine size={18} /></div><div className="metric-mini-value">18</div><div className="metric-mini-label">Produtos Favoritos</div><div className="metric-mini-detail">itens salvos</div></div>
        <div className="metric-mini"><div className="metric-mini-icon"><PencilLine size={18} /></div><div className="metric-mini-value">4.8</div><div className="metric-mini-label">Avaliação Média</div><div className="metric-mini-detail">de 5,0</div></div>
      </div>
    </div>
  );
}

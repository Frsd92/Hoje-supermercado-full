'use client';

import { useSession } from 'next-auth/react';
import { Check, CreditCard, Plus, QrCode, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  PAYMENT_METHOD_UPDATED_EVENT,
  SAVED_CARD_UPDATED_EVENT,
  isPaymentMethod,
  readPaymentMethod,
  savePaymentMethod,
} from '../payment-methods';

const paymentMethodIcons = {
  pix: QrCode,
  cartao: CreditCard,
};

export default function PaymentMethodsPage() {
  const { data: session, status } = useSession();
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD);
  const [isReady, setIsReady] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [savedCard, setSavedCard] = useState(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [cardConfigError, setCardConfigError] = useState('');
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardRemoving, setCardRemoving] = useState(false);
  const [cardFeedback, setCardFeedback] = useState(null);
  const cardFieldsRef = useRef(null);

  useEffect(() => {
    if (status === 'loading') {
      setIsReady(false);
      return;
    }
    setIsReady(false);
    setFeedback(null);
    try {
      setPaymentMethod(readPaymentMethod(session?.user?.email));
    } catch (error) {
      setFeedback({ type: 'error', message: `Não foi possível carregar a preferência de pagamento: ${error.message}` });
    } finally {
      setIsReady(true);
    }
  }, [status, session?.user?.email]);

  useEffect(() => {
    const accountEmail = session?.user?.email || 'guest';
    const handlePaymentMethodUpdate = (event) => {
      if (event.detail?.email !== accountEmail || !isPaymentMethod(event.detail?.method)) return;
      setPaymentMethod(event.detail.method);
    };
    window.addEventListener(PAYMENT_METHOD_UPDATED_EVENT, handlePaymentMethodUpdate);
    return () => window.removeEventListener(PAYMENT_METHOD_UPDATED_EVENT, handlePaymentMethodUpdate);
  }, [session?.user?.email]);

  useEffect(() => {
    if (status === 'loading') {
      setCardReady(false);
      return undefined;
    }
    if (status !== 'authenticated' || !session?.user?.email) {
      setSavedCard(null);
      setCardReady(true);
      setCardAvailable(false);
      return undefined;
    }

    let active = true;
    setCardReady(false);
    setCardFeedback(null);
    const loadCard = async () => {
      try {
        const response = await fetch('/api/my/payment-methods', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o cartão salvo.');
        if (active) setSavedCard(data.card || null);
      } catch (error) {
        if (active) setCardFeedback({ type: 'error', message: error.message });
      } finally {
        if (active) setCardReady(true);
      }
    };
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/pagarme/config', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível verificar a configuração da Pagar.me.');
        if (active) {
          setCardAvailable(Boolean(data.cardAvailable && data.publicKey));
          setCardConfigError('');
        }
      } catch (error) {
        if (active) {
          setCardAvailable(false);
          setCardConfigError(error.message);
        }
      }
    };
    const handleCardUpdate = () => { void loadCard(); };

    void loadCard();
    void loadConfig();
    window.addEventListener(SAVED_CARD_UPDATED_EVENT, handleCardUpdate);
    return () => {
      active = false;
      window.removeEventListener(SAVED_CARD_UPDATED_EVENT, handleCardUpdate);
    };
  }, [status, session?.user?.email]);

  const choosePaymentMethod = (method) => {
    try {
      savePaymentMethod(session?.user?.email, method);
      setPaymentMethod(method);
      setFeedback({ type: 'success', message: 'Preferência de pagamento salva e aplicada ao checkout.' });
    } catch (error) {
      setFeedback({ type: 'error', message: `Não foi possível salvar a preferência: ${error.message}` });
    }
  };

  const tokenizeCard = async () => {
    const fields = cardFieldsRef.current;
    try {
      const readField = (name) => fields?.querySelector(`[name="${name}"]`)?.value || '';
      const number = readField('cardNumber').replace(/\D/g, '');
      const holderName = readField('cardHolder').trim();
      const expiration = readField('cardExpiration');
      const cvv = readField('cardCvv').replace(/\D/g, '');
      const expirationMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(expiration);
      const expirationDate = expirationMatch
        ? new Date(Number(expirationMatch[1]), Number(expirationMatch[2]), 0, 23, 59, 59)
        : null;
      if (number.length < 13 || number.length > 19 || holderName.length < 2 || !expirationDate || expirationDate < new Date() || ![3, 4].includes(cvv.length)) {
        throw new Error('Confira o número, nome, validade e código de segurança do cartão.');
      }

      const configResponse = await fetch('/api/pagarme/config', { cache: 'no-store' });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.cardAvailable || !config.publicKey) {
        throw new Error(config.error || 'A tokenização segura do cartão não está configurada.');
      }

      let response;
      try {
        response = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(config.publicKey)}`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'card',
            card: {
              number,
              holder_name: holderName,
              exp_month: Number(expirationMatch[2]),
              exp_year: Number(expirationMatch[1]),
              cvv,
            },
          }),
        });
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error('Não foi possível conectar à tokenização da Pagar.me. Tente novamente.');
        }
        throw error;
      }
      if (!response.ok) throw new Error('Não foi possível proteger o cartão com a Pagar.me. Confira os dados e tente novamente.');
      const token = await response.json();
      if (!/^token_[A-Za-z0-9]+$/.test(String(token?.id || ''))) {
        throw new Error('A Pagar.me não retornou um token válido para o cartão.');
      }
      return token.id;
    } finally {
      fields?.querySelectorAll('input').forEach((input) => { input.value = ''; });
    }
  };

  const saveCard = async () => {
    if (cardSaving || savedCard) return;
    setCardSaving(true);
    setCardFeedback(null);
    try {
      const cardToken = await tokenizeCard();
      const response = await fetch('/api/my/payment-methods', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o cartão.');
      setSavedCard(data.card);
      setCardFormOpen(false);
      setCardFeedback({ type: 'success', message: 'Cartão salvo com segurança na Pagar.me para suas próximas compras.' });
      window.dispatchEvent(new Event(SAVED_CARD_UPDATED_EVENT));
    } catch (error) {
      setCardFeedback({ type: 'error', message: error.message });
    } finally {
      setCardSaving(false);
    }
  };

  const removeCard = async () => {
    if (cardRemoving || !savedCard) return;
    if (!window.confirm('Remover este cartão salvo da sua conta?')) return;
    setCardRemoving(true);
    setCardFeedback(null);
    try {
      const response = await fetch('/api/my/payment-methods', {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover o cartão.');
      setSavedCard(data.card);
      setCardFeedback({ type: 'success', message: 'Cartão removido da sua conta.' });
      window.dispatchEvent(new Event(SAVED_CARD_UPDATED_EVENT));
    } catch (error) {
      setCardFeedback({ type: 'error', message: error.message });
    } finally {
      setCardRemoving(false);
    }
  };

  const cancelCardEntry = () => {
    cardFieldsRef.current?.querySelectorAll('input').forEach((input) => { input.value = ''; });
    setCardFormOpen(false);
    setCardFeedback(null);
  };

  return (
    <div className="section-shell settings-page payment-methods-page">
      <header className="page-header-block settings-page-header">
        <span className="settings-kicker">Preferências de compra</span>
        <h1>Formas de pagamento</h1>
        <p>Escolha uma forma de pagamento preferida. É obrigatório selecionar uma opção antes de finalizar qualquer pedido; você pode alterá-la no carrinho.</p>
      </header>

      <section className="settings-panel payment-methods-panel" aria-labelledby="payment-methods-heading">
        <div className="settings-panel-heading">
          <CreditCard size={18} />
          <div>
            <h3 id="payment-methods-heading">Sua preferência</h3>
            <p>A escolha é salva neste dispositivo para esta conta.</p>
          </div>
        </div>

        <p className="payment-methods-note">Esta configuração define sua forma de pagamento preferida; nenhum dado de cartão é armazenado.</p>

        <fieldset className="payment-method-list" disabled={!isReady}>
          <legend>Selecione uma forma de pagamento</legend>
          {PAYMENT_METHODS.map((method) => {
            const Icon = paymentMethodIcons[method.value];
            const selected = paymentMethod === method.value;

            return (
              <label className="payment-method-choice" key={method.value}>
                <input
                  className="payment-method-radio"
                  type="radio"
                  name="preferred-payment-method"
                  value={method.value}
                  checked={selected}
                  onChange={() => choosePaymentMethod(method.value)}
                />
                <span className="payment-method-card">
                  <span className="payment-method-icon"><Icon size={19} /></span>
                  <span className="payment-method-copy">
                    <strong>{method.label}</strong>
                    <small>{method.description}</small>
                  </span>
                  <span className="payment-method-selection" aria-hidden="true">{selected && <Check size={15} />}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {isReady && !paymentMethod && <p className="payment-method-feedback error" role="status">Selecione uma forma de pagamento antes de finalizar seu primeiro pedido.</p>}
        {feedback && <p className={`payment-method-feedback ${feedback.type}`} role="status" aria-live="polite">{feedback.message}</p>}
      </section>

      <section className="settings-panel saved-card-panel" aria-labelledby="saved-card-heading">
        <div className="settings-panel-heading">
          <CreditCard size={18} />
          <div>
            <h3 id="saved-card-heading">Cartão para compras futuras</h3>
            <p>Cadastre ou remova o cartão que poderá selecionar no checkout do Dashboard.</p>
          </div>
        </div>

        <p className="saved-card-note">
          O número e o código de segurança são enviados diretamente à Pagar.me. A Plataforma guarda apenas a referência segura do cartão, a bandeira, os quatro últimos dígitos e a validade. O cartão só será cobrado quando você confirmar uma compra.
        </p>

        {!cardReady ? (
          <p className="payment-method-feedback" role="status">Verificando o cartão salvo...</p>
        ) : savedCard ? (
          <div className="saved-card-summary">
            <div className="saved-card-identity">
              <span className="saved-card-icon"><CreditCard size={20} /></span>
              <span>
                <strong>{savedCard.brand} ···· {savedCard.lastFourDigits}</strong>
                <small>Validade {String(savedCard.expMonth).padStart(2, '0')}/{savedCard.expYear}</small>
              </span>
            </div>
            <button
              className="saved-card-remove"
              type="button"
              onClick={removeCard}
              disabled={cardRemoving}
            >
              <Trash2 size={15} />
              {cardRemoving ? 'Removendo...' : 'Remover cartão'}
            </button>
          </div>
        ) : (
          <>
            {cardConfigError && <p className="payment-method-feedback error" role="alert">{cardConfigError}</p>}
            {!cardConfigError && !cardAvailable && <p className="payment-method-feedback error" role="alert">O cadastro de cartão está indisponível no momento.</p>}
            {!cardFormOpen ? (
              <button
                className="saved-card-add"
                type="button"
                onClick={() => { setCardFeedback(null); setCardFormOpen(true); }}
                disabled={!cardAvailable}
              >
                <Plus size={16} />
                Cadastrar cartão
              </button>
            ) : (
              <div className="saved-card-entry">
                <fieldset className="checkout-card-fields" ref={cardFieldsRef} disabled={cardSaving}>
                  <legend>Dados do cartão</legend>
                  <p className="checkout-field-hint">Os dados são tokenizados pela Pagar.me; não são armazenados pela Plataforma.</p>
                  <label className="delivery-address-field">Número do cartão
                    <input name="cardNumber" type="text" inputMode="numeric" autoComplete="cc-number" maxLength={23} required />
                  </label>
                  <label className="delivery-address-field">Nome impresso no cartão
                    <input name="cardHolder" type="text" autoComplete="cc-name" maxLength={100} required />
                  </label>
                  <label className="delivery-address-field">Validade
                    <input name="cardExpiration" type="month" autoComplete="cc-exp" required />
                  </label>
                  <label className="delivery-address-field">Código de segurança
                    <input name="cardCvv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} required />
                  </label>
                </fieldset>
                <div className="saved-card-actions">
                  <button className="saved-card-add" type="button" onClick={saveCard} disabled={cardSaving}>
                    <CreditCard size={16} />
                    {cardSaving ? 'Tokenizando e salvando...' : 'Salvar cartão com segurança'}
                  </button>
                  <button className="saved-card-cancel" type="button" onClick={cancelCardEntry} disabled={cardSaving}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {cardFeedback && <p className={`payment-method-feedback ${cardFeedback.type}`} role="status" aria-live="polite">{cardFeedback.message}</p>}
      </section>
    </div>
  );
}

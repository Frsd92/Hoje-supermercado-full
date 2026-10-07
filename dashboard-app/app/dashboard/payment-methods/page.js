'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Check, CreditCard, Plus, QrCode, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
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
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [savedCard, setSavedCard] = useState(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardLoadError, setCardLoadError] = useState('');
  const [cardAvailable, setCardAvailable] = useState(false);
  const [cardConfigReady, setCardConfigReady] = useState(false);
  const [cardConfigError, setCardConfigError] = useState('');
  const [cardRetryCount, setCardRetryCount] = useState(0);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardRemoving, setCardRemoving] = useState(false);
  const [cardFeedback, setCardFeedback] = useState(null);
  const cardFieldsRef = useRef(null);
  const cardAddButtonRef = useRef(null);
  const returnCardFocusRef = useRef(false);

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
    if (cardFormOpen) {
      cardFieldsRef.current?.querySelector('input')?.focus();
      return;
    }
    if (returnCardFocusRef.current && cardReady && cardConfigReady) {
      cardAddButtonRef.current?.focus();
      returnCardFocusRef.current = false;
    }
  }, [cardFormOpen, savedCard, cardReady, cardConfigReady]);

  useEffect(() => {
    if (status === 'loading') {
      setCardReady(false);
      setCardConfigReady(false);
      return undefined;
    }
    if (status !== 'authenticated' || !session?.user?.email) {
      setSavedCard(null);
      setCardReady(true);
      setCardLoadError('');
      setCardAvailable(false);
      setCardConfigReady(true);
      return undefined;
    }

    let active = true;
    setCardReady(false);
    setCardLoadError('');
    setCardConfigReady(false);
    setCardConfigError('');
    setCardFeedback(null);
    const loadCard = async () => {
      if (active) {
        setCardReady(false);
        setCardLoadError('');
      }
      try {
        const response = await fetch('/api/my/payment-methods', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o cartão salvo.');
        if (active) setSavedCard(data.card || null);
      } catch (error) {
        console.error('Não foi possível verificar o cartão salvo:', error);
        if (active) setCardLoadError('Não foi possível verificar se já existe um cartão salvo. Tente novamente.');
      } finally {
        if (active) setCardReady(true);
      }
    };
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/pagarme/config', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível verificar a disponibilidade do cadastro.');
        if (active) {
          setCardAvailable(Boolean(data.cardAvailable && data.publicKey));
          setCardConfigError('');
        }
      } catch (error) {
        if (active) {
          setCardAvailable(false);
          setCardConfigError('Não foi possível verificar a disponibilidade do cadastro de cartão.');
          console.error('Não foi possível verificar a disponibilidade do cadastro de cartão:', error);
        }
      } finally {
        if (active) setCardConfigReady(true);
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
  }, [status, session?.user?.email, cardRetryCount]);

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
          throw new Error('Não foi possível conectar à validação segura do cartão. Tente novamente.');
        }
        throw error;
      }
      if (!response.ok) throw new Error('Não foi possível validar o cartão. Confira os dados e tente novamente.');
      const token = await response.json();
      if (!/^token_[A-Za-z0-9]+$/.test(String(token?.id || ''))) {
        throw new Error('Não foi possível confirmar a validação do cartão. Confira os dados e tente novamente.');
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
      setCardFeedback({ type: 'success', message: 'Cartão salvo. Ele ficará disponível para suas próximas compras.' });
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
      returnCardFocusRef.current = true;
      window.dispatchEvent(new Event(SAVED_CARD_UPDATED_EVENT));
    } catch (error) {
      setCardFeedback({ type: 'error', message: error.message });
    } finally {
      setCardRemoving(false);
    }
  };

  const cancelCardEntry = () => {
    cardFieldsRef.current?.querySelectorAll('input').forEach((input) => { input.value = ''; });
    returnCardFocusRef.current = true;
    setCardFormOpen(false);
    setCardFeedback(null);
  };

  return (
    <div className="section-shell settings-page payment-methods-page">
      <header className="page-header-block settings-page-header">
        <span className="settings-kicker">Conta e pagamentos</span>
        <h1>Formas de pagamento</h1>
      </header>

      <section className="settings-panel payment-methods-panel" aria-labelledby="payment-methods-heading">
        <div className="settings-panel-heading">
          <QrCode size={21} aria-hidden="true" />
          <div>
            <h2 id="payment-methods-heading">Como prefere pagar?</h2>
          </div>
        </div>

        <fieldset className="payment-method-list" disabled={!isReady}>
          <legend>Selecione uma opção</legend>
          {PAYMENT_METHODS.map((method) => {
            const Icon = paymentMethodIcons[method.value];
            const selected = paymentMethod === method.value;

            return (
              <label className={`payment-method-choice payment-method-choice-${method.value}`} key={method.value}>
                <input
                  className="payment-method-radio"
                  type="radio"
                  name="preferred-payment-method"
                  value={method.value}
                  checked={selected}
                  onChange={() => choosePaymentMethod(method.value)}
                />
                <span className="payment-method-card">
                  <span className="payment-method-icon" aria-hidden="true"><Icon size={19} /></span>
                  <span className="payment-method-copy">
                    <span className="payment-method-title-row">
                      <strong>{method.label}</strong>
                      {method.recommended && <span className="payment-method-recommended">Recomendado</span>}
                    </span>
                    <small>{method.description}</small>
                  </span>
                  <span className="payment-method-selection" aria-hidden="true">{selected && <Check size={15} />}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {isReady && !paymentMethod && <p className="payment-method-feedback error" role="status">Escolha sua forma de pagamento antes de finalizar a compra.</p>}
        {feedback && <p className={`payment-method-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}>{feedback.message}</p>}
      </section>

      <section
        className="settings-panel saved-card-panel"
        aria-labelledby="saved-card-heading"
        aria-describedby="saved-card-intro"
        aria-busy={!cardReady || !cardConfigReady}
      >
        <div className="settings-panel-heading">
          <CreditCard size={20} aria-hidden="true" />
          <div>
            <h2 id="saved-card-heading">Cartão para próximas compras</h2>
            <p>Opcional: salve um cartão e use-o sem preencher os dados novamente.</p>
          </div>
        </div>

        <p className="saved-card-note" id="saved-card-intro">
          O número e o código de segurança são enviados diretamente ao processador de pagamentos; o Dashboard não os recebe nem armazena. Guardamos apenas uma referência segura e os dados mascarados do cartão. Salvar o cartão não gera cobrança.
        </p>

        {!cardReady ? (
          <p className="saved-card-loading" role="status">Verificando se há um cartão salvo...</p>
        ) : status !== 'authenticated' || !session?.user?.email ? (
          <div className="saved-card-state saved-card-state-error" role="alert">
            <p>Entre na sua conta para consultar ou gerenciar cartões.</p>
            <Link className="saved-card-secondary" href="/login?callbackUrl=%2Fdashboard%2Fpayment-methods">Entrar na conta</Link>
          </div>
        ) : cardLoadError ? (
          <div className="saved-card-state saved-card-state-error" role="alert">
            <p>{cardLoadError}</p>
            <button className="saved-card-secondary" type="button" onClick={() => setCardRetryCount((count) => count + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : savedCard ? (
          <div className="saved-card-summary" role="group" aria-label={`Cartão salvo ${savedCard.brand || ''}, terminado em ${savedCard.lastFourDigits}`}>
            <div className="saved-card-summary-main">
              <span className="saved-card-icon" aria-hidden="true"><CreditCard size={20} /></span>
              <div className="saved-card-identity">
                <span className="saved-card-label">Cartão salvo</span>
                <strong>{savedCard.brand || 'Cartão'} <span aria-label={`terminado em ${savedCard.lastFourDigits}`}>•••• {savedCard.lastFourDigits}</span></strong>
                <small>Validade {String(savedCard.expMonth).padStart(2, '0')}/{savedCard.expYear}</small>
              </div>
              <span className="saved-card-status">Pronto para usar</span>
            </div>
            <div className="saved-card-summary-footer">
              <p>Você confirma o pedido antes de qualquer cobrança.</p>
              <button
                className="saved-card-remove"
                type="button"
                onClick={removeCard}
                disabled={cardRemoving}
                aria-label={`Remover cartão terminado em ${savedCard.lastFourDigits}`}
              >
                <Trash2 size={16} aria-hidden="true" />
                {cardRemoving ? 'Removendo...' : 'Remover cartão'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!cardConfigReady ? (
              <p className="saved-card-loading" role="status">Verificando a disponibilidade do cadastro...</p>
            ) : cardConfigError || !cardAvailable ? (
              <div className="saved-card-state saved-card-state-error" role="alert">
                <p>{cardConfigError || 'O cadastro de cartão está temporariamente indisponível.'}</p>
                <button className="saved-card-secondary" type="button" onClick={() => setCardRetryCount((count) => count + 1)}>
                  Verificar novamente
                </button>
              </div>
            ) : !cardFormOpen ? (
              <div className="saved-card-empty">
                <div className="saved-card-empty-copy">
                  <span className="saved-card-empty-icon" aria-hidden="true"><CreditCard size={19} /></span>
                  <div>
                    <strong>Nenhum cartão salvo</strong>
                    <p>Cadastre um cartão para usá-lo no checkout. Mantenha nome, CPF e celular com DDD atualizados no perfil.</p>
                    <Link className="saved-card-inline-link" href="/dashboard/profile">Revisar perfil</Link>
                  </div>
                </div>
                <button
                  ref={cardAddButtonRef}
                  className="saved-card-add"
                  type="button"
                  onClick={() => { setCardFeedback(null); setCardFormOpen(true); }}
                >
                  <Plus size={17} aria-hidden="true" />
                  Adicionar cartão
                </button>
              </div>
            ) : (
              <form
                className="saved-card-entry"
                aria-busy={cardSaving}
                onSubmit={(event) => { event.preventDefault(); void saveCard(); }}
              >
                <fieldset className="checkout-card-fields" ref={cardFieldsRef} disabled={cardSaving} aria-describedby="saved-card-form-help">
                  <legend>Dados do cartão</legend>
                  <p className="saved-card-form-help" id="saved-card-form-help">
                    O número e o código são enviados diretamente para validação. Não os armazenamos e o cadastro não cobra o cartão.
                  </p>
                  <label className="delivery-address-field">Número do cartão
                    <input name="cardNumber" type="text" inputMode="numeric" autoComplete="cc-number" maxLength={23} required />
                  </label>
                  <label className="delivery-address-field">Nome impresso no cartão
                    <input name="cardHolder" type="text" autoComplete="cc-name" maxLength={100} required />
                  </label>
                  <div className="saved-card-field-row">
                    <label className="delivery-address-field">Validade
                      <input name="cardExpiration" type="month" autoComplete="cc-exp" required />
                    </label>
                    <label className="delivery-address-field">Código de segurança
                      <input name="cardCvv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} required />
                    </label>
                  </div>
                </fieldset>
                <div className="saved-card-actions">
                  <button className="saved-card-add" type="submit" disabled={cardSaving}>
                    <CreditCard size={17} aria-hidden="true" />
                    {cardSaving ? 'Validando e salvando...' : 'Salvar cartão'}
                  </button>
                  <button className="saved-card-secondary" type="button" onClick={cancelCardEntry} disabled={cardSaving}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {cardFeedback && <p className={`payment-method-feedback ${cardFeedback.type}`} role={cardFeedback.type === 'error' ? 'alert' : 'status'} aria-live={cardFeedback.type === 'error' ? 'assertive' : 'polite'}>{cardFeedback.message}</p>}
      </section>
    </div>
  );
}

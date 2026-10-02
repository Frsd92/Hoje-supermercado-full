'use client';

import { useSession } from 'next-auth/react';
import { Banknote, Check, CreditCard, MessageCircle, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  PAYMENT_METHOD_UPDATED_EVENT,
  isPaymentMethod,
  readPaymentMethod,
  savePaymentMethod,
} from '../payment-methods';

const paymentMethodIcons = {
  pix: QrCode,
  cartao: CreditCard,
  dinheiro: Banknote,
  outro: MessageCircle,
};

export default function PaymentMethodsPage() {
  const { data: session, status } = useSession();
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD);
  const [isReady, setIsReady] = useState(false);
  const [feedback, setFeedback] = useState(null);

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

  const choosePaymentMethod = (method) => {
    try {
      savePaymentMethod(session?.user?.email, method);
      setPaymentMethod(method);
      setFeedback({ type: 'success', message: 'Preferência de pagamento salva e aplicada ao checkout.' });
    } catch (error) {
      setFeedback({ type: 'error', message: `Não foi possível salvar a preferência: ${error.message}` });
    }
  };

  return (
    <div className="section-shell settings-page payment-methods-page">
      <header className="page-header-block settings-page-header">
        <span className="settings-kicker">Preferências de compra</span>
        <h1>Formas de pagamento</h1>
        <p>Escolha qual opção deve aparecer selecionada ao finalizar seu pedido. Você pode alterá-la no carrinho sempre que precisar.</p>
      </header>

      <section className="settings-panel payment-methods-panel" aria-labelledby="payment-methods-heading">
        <div className="settings-panel-heading">
          <CreditCard size={18} />
          <div>
            <h3 id="payment-methods-heading">Sua preferência</h3>
            <p>A escolha é salva neste dispositivo para esta conta.</p>
          </div>
        </div>

        <p className="payment-methods-note">Esta configuração apenas define a opção padrão; nenhum dado de cartão é armazenado.</p>

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

        {feedback && <p className={`payment-method-feedback ${feedback.type}`} role="status" aria-live="polite">{feedback.message}</p>}
      </section>
    </div>
  );
}

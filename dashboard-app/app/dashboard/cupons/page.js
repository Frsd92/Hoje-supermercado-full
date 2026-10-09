import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

export default function CustomerCouponsPage() {
  return <div className="section-shell orders-showcase customer-coupons-showcase">
    <header className="section-header orders-header">
      <div>
        <span className="orders-kicker">Vantagens da sua conta</span>
        <h1>Use seu cupom</h1>
        <p>Os códigos não são exibidos em uma lista. Cada cupom é validado individualmente no carrinho.</p>
      </div>
      <div className="orders-header-mark">
        <span className="orders-header-dot" />
        Validação segura
      </div>
    </header>

    <div className="customer-coupon-rules">
      <strong>Como aplicar um cupom</strong>
      <ul>
        <li>Use o código enviado para sua conta.</li>
        <li>Adicione os produtos desejados e abra o carrinho da loja.</li>
        <li>Digite um único código no campo de cupom e pressione “Aplicar”.</li>
        <li>A validade, o vínculo com sua conta e o pedido mínimo são confirmados pelo servidor.</li>
      </ul>
      <Link href="/index.html" className="secondary-cta">
        <ShoppingBag size={16} aria-hidden="true" />
        Ir para a loja
      </Link>
    </div>
  </div>;
}

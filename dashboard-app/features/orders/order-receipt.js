import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import { buildOrderReceiptData } from './order-receipt-data';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const orderStatusLabels = {
  Recebido: 'Recebido pela loja',
  Separacao: 'Em separação',
  Expedicao: 'Em expedição',
  'Em transito': 'Em trânsito',
  Concluido: 'Entrega concluída',
  Cancelado: 'Cancelado',
};

const paymentLabels = {
  pix: 'Pix informado',
  cartao: 'Cartão informado',
  dinheiro: 'Dinheiro informado',
  outro: 'A combinar',
};

function money(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export default function OrderReceipt({ order }) {
  const receipt = buildOrderReceiptData(order);

  return <section className="order-receipt" aria-labelledby="order-receipt-title">
    <header className="order-receipt-header">
      <span className="order-receipt-brand-mark" aria-hidden="true">H</span>
      <p className="order-receipt-store">HOJE SUPERMERCADO</p>
      <h2 id="order-receipt-title">Comprovante do pedido</h2>
      <span className="order-receipt-document-badge">DIGITAL · NÃO FISCAL</span>
    </header>

    <dl className="order-receipt-metadata">
      <div><dt>Referência rastreável</dt><dd>{receipt.orderId || 'Pedido sem identificação'}</dd></div>
      <div><dt>Data do pedido</dt><dd>{formatDate(receipt.createdAt)}</dd></div>
      <div><dt>Situação</dt><dd>{orderStatusLabels[receipt.status] || receipt.status}</dd></div>
      <div><dt>Forma informada</dt><dd>{paymentLabels[receipt.paymentMethod] || 'Não informada'}</dd></div>
      <div><dt>CPF solicitado para documento fiscal</dt><dd>{receipt.includeCpfOnReceipt ? 'Sim' : 'Não'}</dd></div>
    </dl>

    <div className="order-receipt-section-heading">
      <h3>Itens do pedido</h3>
      <span>Valores conforme registro da compra</span>
    </div>
    <table className="order-receipt-items">
      <caption className="sr-only">Produtos, quantidades e valores do pedido</caption>
      <thead><tr><th scope="col">Produto e quantidade</th><th scope="col">Total</th></tr></thead>
      <tbody>
        {receipt.items.map((item, index) => <tr key={`${receipt.orderId}-${item.name}-${index}`}>
          <th scope="row">
            <span>{item.name}</span>
            <small>{formatCartQuantity(item)} × {money(item.unitPrice)}{item.unit === 'kg' ? ' / kg' : ' / un.'}</small>
          </th>
          <td>{money(item.lineTotal)}</td>
        </tr>)}
        {!receipt.items.length && <tr><td colSpan="2">Não há itens detalhados neste pedido.</td></tr>}
      </tbody>
    </table>

    <dl className="order-receipt-totals">
      <div><dt>Subtotal registrado</dt><dd>{money(receipt.subtotal)}</dd></div>
      {Math.abs(receipt.subtotalAdjustment) >= 0.01 && <div><dt>Ajuste entre itens e subtotal registrado</dt><dd>{money(receipt.subtotalAdjustment)}</dd></div>}
      {(receipt.couponCode || receipt.couponDiscountAmount > 0) && <div className="order-receipt-discount">
        <dt>Cupom aplicado {receipt.couponCode && <span>({receipt.couponCode})</span>}{receipt.couponDiscountPercent > 0 && <span> · {receipt.couponDiscountPercent}%</span>}</dt>
        <dd>−{money(receipt.couponDiscountAmount)}</dd>
      </div>}
      {Math.abs(receipt.totalAdjustment) >= 0.01 && <div><dt>Ajuste registrado</dt><dd>{money(receipt.totalAdjustment)}</dd></div>}
      <div className="order-receipt-final-total"><dt>Total informado no pedido</dt><dd>{money(receipt.total)}</dd></div>
    </dl>

    <p className="order-receipt-disclaimer" id="order-receipt-disclaimer">
      <strong>Este comprovante não tem valor fiscal e não comprova pagamento.</strong>
      Não substitui uma NFC-e/NF-e autorizada. A emissão de documento fiscal oficial ainda depende da configuração da integração fiscal.
    </p>
    <footer className="order-receipt-footer">
      Para atendimento e rastreio, informe a referência completa do pedido acima.
    </footer>
  </section>;
}

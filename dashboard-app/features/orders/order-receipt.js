import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import { buildOrderReceiptData } from './order-receipt-data';
import { receiptIssuer } from './receipt-issuer';

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
  pix: 'Pix',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  outro: 'A combinar',
};
const promotionLabels = {
  flash_offer: 'Oferta relâmpago',
  catalog_price: 'Preço promocional',
  catalog_discount: 'Desconto de catálogo',
};

function formatCpf(value) {
  return value.length === 11
    ? value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : '';
}

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

function formatQuantity(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);
}

export default function OrderReceipt({ order }) {
  const receipt = buildOrderReceiptData(order);
  const quantitySummary = [
    receipt.totalUnitQuantity > 0 && `${formatQuantity(receipt.totalUnitQuantity)} un.`,
    receipt.totalWeightQuantity > 0 && `${formatQuantity(receipt.totalWeightQuantity)} kg`,
  ].filter(Boolean).join(' + ');

  return <section className="order-receipt" aria-labelledby="order-receipt-title">
    <header className="order-receipt-header">
      <span className="order-receipt-brand-mark" aria-hidden="true">H</span>
      <p className="order-receipt-store">{receiptIssuer.tradeName}</p>
      <p className="order-receipt-issuer-name">Razão social: {receiptIssuer.legalName}</p>
      <p className="order-receipt-issuer-cnpj">CNPJ: {receiptIssuer.cnpj}</p>
      <p className="order-receipt-issuer-details">Inscrição Estadual: {receiptIssuer.stateRegistration}</p>
      <p className="order-receipt-issuer-details">{receiptIssuer.address}</p>
      <h2 id="order-receipt-title">Comprovante interno da venda</h2>
      <span className="order-receipt-document-badge">INTERNO · NÃO FISCAL</span>
    </header>

    <dl className="order-receipt-metadata">
      <div><dt>Código interno para rastreio/estorno</dt><dd>{receipt.orderId || 'Pedido sem identificação'}</dd></div>
      <div><dt>Data do pedido</dt><dd>{formatDate(receipt.createdAt)}</dd></div>
      <div><dt>Situação</dt><dd>{orderStatusLabels[receipt.status] || receipt.status}</dd></div>
      <div><dt>Forma de pagamento informada</dt><dd>{paymentLabels[receipt.paymentMethod] || 'Não informada'}</dd></div>
      <div><dt>Consumidor</dt><dd>{receipt.invoiceCpf ? `CPF ${formatCpf(receipt.invoiceCpf)}` : 'Consumidor não identificado'}</dd></div>
      <div><dt>Documento fiscal</dt><dd>NFC-e não registrada no sistema</dd></div>
      <div><dt>Operador / caixa</dt><dd>Pedido digital · não aplicável</dd></div>
    </dl>

    <div className="order-receipt-section-heading">
      <h3>Itens do pedido ({receipt.itemLineCount} linhas)</h3>
      <span>Quantidade: {quantitySummary || 'não informada'}</span>
    </div>
    <table className="order-receipt-items">
      <caption className="sr-only">Código, produtos, quantidades e valores do pedido</caption>
      <thead><tr><th scope="col">Código, produto e quantidade</th><th scope="col">Total</th></tr></thead>
      <tbody>
        {receipt.items.map((item, index) => <tr key={`${receipt.orderId}-${item.name}-${index}`}>
          <th scope="row">
            <span>{item.name}</span>
            <small>Código: {item.productCode || 'não registrado'}</small>
            <small>{formatCartQuantity(item)} × {money(item.unitPrice)}{item.unit === 'kg' ? ' / kg' : ' / un.'}</small>
            {item.promotionDiscount > 0 && <small>{promotionLabels[item.promotionType] || 'Desconto promocional'}: −{money(item.promotionDiscount)}</small>}
          </th>
          <td>{money(item.lineTotal)}</td>
        </tr>)}
        {!receipt.items.length && <tr><td colSpan="2">Não há itens detalhados neste pedido.</td></tr>}
      </tbody>
    </table>

    <dl className="order-receipt-totals">
      {receipt.promotionDiscountAmount > 0 && <>
        <div><dt>Subtotal antes das promoções registradas</dt><dd>{money(receipt.subtotal + receipt.promotionDiscountAmount)}</dd></div>
        <div className="order-receipt-discount"><dt>Promoções nos itens</dt><dd>−{money(receipt.promotionDiscountAmount)}</dd></div>
      </>}
      <div><dt>Subtotal após promoções</dt><dd>{money(receipt.subtotal)}</dd></div>
      {Math.abs(receipt.subtotalAdjustment) >= 0.01 && <div><dt>Ajuste entre itens e subtotal registrado</dt><dd>{money(receipt.subtotalAdjustment)}</dd></div>}
      {(receipt.couponCode || receipt.couponDiscountAmount > 0) && <div className="order-receipt-discount">
        <dt>Cupom aplicado {receipt.couponCode && <span>({receipt.couponCode})</span>}{receipt.couponDiscountPercent > 0 && <span> · {receipt.couponDiscountPercent}%</span>}</dt>
        <dd>−{money(receipt.couponDiscountAmount)}</dd>
      </div>}
      {Math.abs(receipt.totalAdjustment) >= 0.01 && <div><dt>Ajuste registrado</dt><dd>{money(receipt.totalAdjustment)}</dd></div>}
      <div className="order-receipt-final-total"><dt>Valor total da compra</dt><dd>{money(receipt.total)}</dd></div>
    </dl>

    <p className="order-receipt-disclaimer" id="order-receipt-disclaimer">
      <strong>Este é um comprovante interno; não é DANFE nem NFC-e/NF-e autorizada.</strong>
      O sistema ainda não registra chave de acesso, protocolo, QR Code, tributos aproximados ou confirmação de pagamento. A forma exibida foi informada no pedido; nenhum valor foi confirmado como pago.
    </p>
    <footer className="order-receipt-footer">
      Guarde o código interno acima para localizar o pedido ou solicitar um estorno.
    </footer>
  </section>;
}

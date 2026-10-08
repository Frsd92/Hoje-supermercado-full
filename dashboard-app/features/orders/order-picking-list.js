import { formatCartQuantity } from '@/app/dashboard/cart-utils';

function formatOrderDate(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export default function OrderPickingList({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];

  return <section className="order-picking-sheet" aria-labelledby="order-picking-list-title">
    <header className="order-picking-header">
      <p className="order-picking-brand">HOJE SUPERMERCADO</p>
      <h2 id="order-picking-list-title">Lista de separação</h2>
      <strong className="order-picking-order-id">{order?.id || 'Pedido sem identificação'}</strong>
      <p id="order-picking-list-description">Separe e confira cada produto antes de concluir o pedido.</p>
    </header>

    <dl className="order-picking-metadata">
      <div><dt>Cliente</dt><dd>{order?.customerName || 'Cliente não identificado'}</dd></div>
      <div><dt>Data do pedido</dt><dd>{formatOrderDate(order?.createdAtIso || order?.createdAt)}</dd></div>
    </dl>

    <div className="order-picking-items-heading">
      <h3>Produtos</h3>
      <span>{items.length} {items.length === 1 ? 'linha' : 'linhas'}</span>
    </div>
    <p className="sr-only">Marque cada caixa no papel após separar o produto.</p>
    <ol className="order-picking-items">
      {items.map((item, index) => <li key={item.id || `${item.productCode || item.name}-${index}`}>
        <span className="order-picking-checkbox" aria-hidden="true" />
        <span className="order-picking-product">
          <strong>{item.name || 'Produto sem identificação'}</strong>
          <small>Código: {item.productCode || 'não informado'}</small>
        </span>
        <strong className="order-picking-quantity">{formatCartQuantity(item)}</strong>
      </li>)}
      {!items.length && <li className="order-picking-empty">Este pedido não possui itens registrados.</li>}
    </ol>

    <footer className="order-picking-signoff">
      <div><span>Separado por</span><i /></div>
      <div><span>Conferido por</span><i /></div>
    </footer>
  </section>;
}

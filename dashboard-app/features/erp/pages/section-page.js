'use client';

import { useParams } from 'next/navigation';
import CommunicationsPage from './communications-page';

const sections = {
  catalog: ['Cadastro de Produto', 'Acesse o formulário de produtos e organize o catálogo.'],
  products: ['Produtos', 'Catálogo, estoque, lotes, validade e histórico de preços.'],
  orders: ['Pedidos', 'Pedidos, separação, expedição e status de entrega.'],
  customers: ['Clientes', 'Clientes, comportamento, favoritos e histórico de compras.'],
  suppliers: ['Fornecedores', 'Fornecedores, compras, custos e produtos fornecidos.'],
  promotions: ['Comunicação', 'Avisos, novidades e mensagens direcionadas aos clientes.'],
  reports: ['Relatórios', 'Faturamento, lucro, margem, giro e indicadores operacionais.'],
  analytics: ['Analytics', 'Leitura em tempo real do desempenho registrado no ERP.'],
};

export default function ERPSectionPage() {
  const { section } = useParams();
  if (section === 'communications') return <CommunicationsPage />;
  const [title, description] = sections[section] || ['Módulo ERP', 'Este módulo está sendo preparado.'];

  return <div className="erp-placeholder"><span className="eyebrow">ERP Operacional</span><h1>{title}</h1><p>{description}</p><div className="erp-placeholder-line" /></div>;
}

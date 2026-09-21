'use client';

import { useParams } from 'next/navigation';

const sections = {
  catalog: ['Central de Cadastros', 'Produtos, marcas, categorias e unidades em um único lugar.'],
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
  const [title, description] = sections[section] || ['Módulo ERP', 'Este módulo está sendo preparado.'];

  return <div className="erp-placeholder"><span className="eyebrow">ERP Operacional</span><h1>{title}</h1><p>{description}</p><div className="erp-placeholder-line" /></div>;
}

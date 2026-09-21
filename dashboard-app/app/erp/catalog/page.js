'use client';

import Link from 'next/link';
import { Building2, FolderTree, Package, Plus, Ruler } from 'lucide-react';

const entries = [
  ['Produtos', 'Cadastro completo, SKU, preço, estoque e validade.', '/erp/products', Package],
  ['Categorias', 'Organize o catálogo em grupos de navegação.', '#', FolderTree],
  ['Marcas e fabricantes', 'Registre marcas, fabricantes e parceiros.', '#', Building2],
  ['Unidades de medida', 'Unidade, kg, litro, caixa e embalagem.', '#', Ruler],
];

export default function CatalogPage() {
  return <div className="erp-module-page"><div className="erp-customer-header"><div><span className="eyebrow">Dados mestres</span><h1>Central de Cadastros</h1><p>Cadastros que estruturam toda a operação.</p></div><Link className="primary-cta" href="/erp/products"><Plus size={16} /> Novo produto</Link></div><div className="erp-module-grid">{entries.map(([title, description, href, Icon]) => <Link key={title} href={href} className="erp-module-card"><span><Icon size={19} /></span><h2>{title}</h2><p>{description}</p><strong>Gerenciar</strong></Link>)}</div></div>;
}
import { notFound } from 'next/navigation';
import { calculateSalePrice } from '@/features/erp/api/product-pricing';
import { getProductCatalog } from '@/features/erp/api/product-catalog';
import { publicProductImage } from '@/features/erp/api/product-image-url';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function storeBaseUrl() {
  const configuredUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.hojesupermercado.com.br');
  return new URL(configuredUrl);
}

function findActiveProduct(products, id) {
  return products.find((product) => String(product.id) === String(id) && product.status === 'Ativo');
}

async function loadProduct(id) {
  if (!id) return null;
  const products = await getProductCatalog(prisma, { strict: true });
  return findActiveProduct(products, id);
}

export async function generateMetadata({ searchParams }) {
  const { id } = await searchParams;
  const product = await loadProduct(id);
  if (!product) return { title: 'Produto não encontrado | Hoje Supermercado' };

  const baseUrl = storeBaseUrl();
  const image = publicProductImage(product);
  return {
    title: `${product.title} | Hoje Supermercado`,
    description: product.description,
    alternates: { canonical: new URL(`/produto?id=${encodeURIComponent(product.id)}`, baseUrl).toString() },
    openGraph: {
      title: product.title,
      description: product.description,
      url: new URL(`/produto?id=${encodeURIComponent(product.id)}`, baseUrl).toString(),
      images: image ? [new URL(image, `${baseUrl}/`).toString()] : [],
      type: 'website',
    },
  };
}

export default async function ProductPage({ searchParams }) {
  const { id } = await searchParams;
  const product = await loadProduct(id);
  if (!product) notFound();

  const baseUrl = storeBaseUrl();
  const salePrice = calculateSalePrice(product);
  const image = publicProductImage(product);
  const productUrl = new URL(`/produto?id=${encodeURIComponent(product.id)}`, baseUrl).toString();
  const available = Number(product.quantity) > 0;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(image ? { image: new URL(image, `${baseUrl}/`).toString() } : {}),
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'BRL',
      price: salePrice.toFixed(2),
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  const jsonLd = JSON.stringify(schema).replace(/</g, '\\u003c');

  return (
    <main style={{ minHeight: '100vh', padding: '32px 18px', background: '#f5f8f5', color: '#183d29', fontFamily: 'Arial, sans-serif' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <article className="erp-product-detail" style={{ display: 'grid', gap: 28, maxWidth: 1000, margin: '40px auto', padding: 28, borderRadius: 18, background: '#fff', boxShadow: '0 12px 32px rgba(15, 23, 42, .08)' }}>
        <div style={{ display: 'grid', minHeight: 280, placeItems: 'center', borderRadius: 14, background: '#f8faf8' }}>
          {image ? <img src={new URL(image, `${baseUrl}/`).toString()} alt={product.title} style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain' }} /> : <span>Imagem indisponível</span>}
        </div>
        <div style={{ alignSelf: 'center' }}>
          <a href="/" style={{ color: '#286441', fontWeight: 700, textDecoration: 'none' }}>← Voltar para a loja</a>
          <h1 style={{ margin: '22px 0 12px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)' }}>{product.title}</h1>
          <p style={{ color: '#52665a', lineHeight: 1.65 }}>{product.description}</p>
          <p style={{ margin: '20px 0 8px', fontSize: '1.8rem', fontWeight: 800 }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(salePrice)}</p>
          <p style={{ color: available ? '#166534' : '#9a3412', fontWeight: 700 }}>{available ? 'Disponível em estoque' : 'Indisponível no momento'}</p>
          <a href="/" style={{ display: 'inline-flex', marginTop: 16, padding: '12px 18px', borderRadius: 9, background: '#1c5a38', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Ver catálogo da loja</a>
        </div>
      </article>
    </main>
  );
}

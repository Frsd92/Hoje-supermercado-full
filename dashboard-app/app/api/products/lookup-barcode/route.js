import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { getOpenFoodFactsProductName, normalizeProductBarcode } from '@/features/erp/api/product-barcode-lookup';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) {
    return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const barcode = normalizeProductBarcode(new URL(request.url).searchParams.get('barcode'));
  if (!barcode) {
    return Response.json({ error: 'Informe um código de barras numérico de 8 a 14 dígitos.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=product_name,product_name_pt`,
      {
        headers: {
          'User-Agent': 'HojeSupermercadoERP/1.0 (server; https://www.hojesupermercado.com.br)',
        },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 86400 },
      },
    );
    if (!response.ok) {
      console.error(`O catálogo de produtos respondeu com HTTP ${response.status} na busca de código de barras.`);
      return Response.json(
        { error: 'O catálogo de produtos está temporariamente indisponível. Você pode cadastrar o nome manualmente.' },
        { status: 503 },
      );
    }

    const productName = getOpenFoodFactsProductName(await response.json());
    if (!productName) {
      return Response.json(
        { error: 'Não encontramos este código no catálogo público. Você pode cadastrar o nome manualmente.' },
        { status: 404 },
      );
    }

    return Response.json({ productName, source: 'Open Food Facts' }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível consultar o catálogo por código de barras:', error);
    return Response.json(
      { error: 'Não foi possível consultar o catálogo. Verifique a conexão e cadastre o nome manualmente.' },
      { status: 503 },
    );
  }
}

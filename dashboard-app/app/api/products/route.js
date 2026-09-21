import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const productsFile = path.join(process.cwd(), 'data', 'products.json');
const ordersFile = path.join(process.cwd(), 'data', 'orders.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

async function readProducts() {
  try {
    const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

async function readSales() {
  try {
    const orders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    return (Array.isArray(orders) ? orders : []).reduce((sales, order) => {
      (order.items || []).forEach((item) => {
        const key = String(item.productId || item.name || '').trim().toLowerCase();
        if (key) sales[key] = (sales[key] || 0) + (Number(item.quantity) || 0);
      });
      return sales;
    }, {});
  } catch {
    return {};
  }
}

function ensurePriceHistory(product) {
  if (Array.isArray(product.priceHistory) && product.priceHistory.length) return product;
  return {
    ...product,
    priceHistory: [{
      date: product.updatedAt || product.createdAt || new Date().toISOString(),
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      discount: Number(product.discount) || 0,
      changedBy: product.updatedBy || product.createdBy || 'sistema',
    }],
  };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  const products = await readProducts();
  const sales = await readSales();
  const activeProducts = products.filter((product) => product.status === 'Ativo').map((product) => ({
    ...ensurePriceHistory(product),
    salePrice: Number((Number(product.price) * (1 - Number(product.discount || 0) / 100)).toFixed(2)),
    salesCount: sales[String(product.id).toLowerCase()] || sales[String(product.title).toLowerCase()] || 0,
  }));
  return Response.json({ products: activeProducts }, { headers: corsHeaders(request) });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const allowed = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase());
  if (!session?.user?.email || !allowed.includes(session.user.email.toLowerCase())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  const product = await request.json();
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const categories = Array.isArray(product?.categories)
    ? [...new Set(product.categories.map((category) => String(category).trim()).filter(Boolean))]
    : [];
  const status = ['Ativo', 'Rascunho', 'Arquivado'].includes(product?.status) ? product.status : 'Ativo';
  if (!title || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isFinite(quantity) || quantity < 0 || !categories.length) return Response.json({ error: 'Informe nome, preço, custo, desconto válido, estoque e ao menos uma categoria.' }, { status: 400, headers: corsHeaders(request) });

  const products = await readProducts();
  const savedProduct = {
    ...product,
    title,
    price,
    cost,
    discount,
    quantity,
    categories,
    subcategory: String(product?.subcategory || '').trim(),
    status,
    id: `PROD-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: session.user.email,
    priceHistory: [{
      date: new Date().toISOString(),
      price,
      cost,
      discount,
      changedBy: session.user.email,
    }],
  };
  await fs.mkdir(path.dirname(productsFile), { recursive: true });
  await fs.writeFile(productsFile, JSON.stringify([...products, savedProduct], null, 2), 'utf8');
  return Response.json({ product: savedProduct }, { status: 201, headers: corsHeaders(request) });
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const allowed = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase());
  if (!session?.user?.email || !allowed.includes(session.user.email.toLowerCase())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  const product = await request.json();
  const productId = String(product?.id || '').trim();
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const categories = Array.isArray(product?.categories)
    ? [...new Set(product.categories.map((category) => String(category).trim()).filter(Boolean))]
    : [];
  const status = ['Ativo', 'Rascunho', 'Arquivado'].includes(product?.status) ? product.status : 'Ativo';
  if (!productId || !title || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isFinite(quantity) || quantity < 0 || !categories.length) return Response.json({ error: 'Informe nome, preço, custo, desconto válido, estoque e ao menos uma categoria.' }, { status: 400, headers: corsHeaders(request) });

  const products = await readProducts();
  const productIndex = products.findIndex((item) => String(item.id) === productId);
  if (productIndex < 0) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });

  const currentProduct = products[productIndex];
  const currentHistory = ensurePriceHistory(currentProduct).priceHistory;
  const valueChanged = Number(currentProduct.price) !== price || Number(currentProduct.cost || 0) !== cost || Number(currentProduct.discount || 0) !== discount;
  const savedProduct = {
    ...currentProduct,
    ...product,
    id: currentProduct.id,
    title,
    price,
    cost,
    discount,
    quantity,
    categories,
    subcategory: String(product?.subcategory || '').trim(),
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.email,
    priceHistory: valueChanged
      ? [...currentHistory, { date: new Date().toISOString(), price, cost, discount, changedBy: session.user.email }]
      : currentHistory,
  };
  products[productIndex] = savedProduct;
  await fs.mkdir(path.dirname(productsFile), { recursive: true });
  await fs.writeFile(productsFile, JSON.stringify(products, null, 2), 'utf8');
  return Response.json({ product: savedProduct }, { headers: corsHeaders(request) });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const allowed = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase());
  if (!session?.user?.email || !allowed.includes(session.user.email.toLowerCase())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  const { id } = await request.json();
  const productId = String(id || '').trim();
  if (!productId) return Response.json({ error: 'Informe o produto que será excluído.' }, { status: 400, headers: corsHeaders(request) });

  const products = await readProducts();
  const remainingProducts = products.filter((product) => String(product.id) !== productId);
  if (remainingProducts.length === products.length) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });
  await fs.writeFile(productsFile, JSON.stringify(remainingProducts, null, 2), 'utf8');
  return Response.json({ deletedId: productId }, { headers: corsHeaders(request) });
}

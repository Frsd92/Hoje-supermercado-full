import { promises as fs } from 'fs';
import path from 'path';

const productsFile = path.join(process.cwd(), 'data', 'products.json');
const minimumPerCategory = 50;
const sourceBaseUrl = 'https://world.openfoodfacts.org/api/v2/search';

const categorySources = [
  { name: 'Hortifruti', tags: ['fruits-and-vegetables', 'fruits', 'vegetables'] },
  { name: 'Açougue', tags: ['meats', 'meat-products', 'sausages'] },
  { name: 'Padaria', tags: ['breads', 'biscuits-and-cookies', 'pastries'] },
  { name: 'Mercearia', tags: ['groceries', 'cereals', 'pasta', 'sauces'] },
  { name: 'Bebidas', tags: ['beverages', 'juices', 'sodas'] },
  { name: 'Vinhos', tags: ['wines'] },
  { name: 'Bebidas Alcoólicas', tags: ['alcoholic-beverages', 'beers', 'spirits'] },
  { name: 'Produtos de Limpeza', tags: ['cleaning-products', 'cleaning'] },
  { name: 'Lavanderia', tags: ['laundry-products', 'laundry-detergents', 'washing-products'] },
  { name: 'Pet Shop', tags: ['pet-food', 'pet-products', 'cat-food', 'dog-food'] },
  { name: 'Higiene Pessoal', tags: ['personal-care', 'toiletries', 'oral-hygiene'] },
  { name: 'Bomboniere', tags: ['chocolates', 'candies', 'confectioneries'] },
  { name: 'Laticínios', tags: ['dairies', 'milk', 'cheeses', 'yogurts'] },
  { name: 'Bebês', tags: ['baby-food', 'baby-products', 'infant-formula'] },
  { name: 'Carnes', tags: ['meats', 'meat-products', 'poultries', 'fish-and-seafood'] },
];

const basePrices = {
  Hortifruti: 6.99,
  Açougue: 24.9,
  Padaria: 8.9,
  Mercearia: 12.9,
  Bebidas: 7.9,
  Vinhos: 39.9,
  'Bebidas Alcoólicas': 14.9,
  'Produtos de Limpeza': 11.9,
  Lavanderia: 18.9,
  'Pet Shop': 21.9,
  'Higiene Pessoal': 13.9,
  Bomboniere: 8.9,
  Laticínios: 9.9,
  Bebês: 25.9,
  Carnes: 24.9,
};

const readProducts = async () => {
  try {
    const value = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const productKey = (product) => cleanText(product.code || product.product_name).toLowerCase();

async function fetchProducts(tag) {
  const params = new URLSearchParams({
    categories_tags_en: tag,
    fields: 'product_name,brands,quantity,code,image_url',
    page_size: '100',
    page: '1',
  });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${sourceBaseUrl}?${params}`, { headers: { 'User-Agent': 'HojeSupermercadoCatalog/1.0' } });
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data.products) ? data.products : [];
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw new Error(`Open Food Facts não respondeu para ${tag}`);
}

function normalizeProduct(raw, category, index) {
  const title = cleanText(raw.product_name);
  const brand = cleanText(raw.brands).split(',')[0].trim();
  const quantity = cleanText(raw.quantity);
  const displayTitle = [brand, title, quantity].filter(Boolean).join(' ');
  const price = Number((basePrices[category] + (index % 7) * 1.37).toFixed(2));
  return {
    title: displayTitle,
    description: `Produto real catalogado pela base Open Food Facts. Marca: ${brand || 'não informada'}.`,
    price,
    cost: Number((price * 0.72).toFixed(2)),
    discount: 0,
    quantity: 0,
    sku: cleanText(raw.code),
    barcode: cleanText(raw.code),
    brand,
    supplier: '',
    categories: [category],
    subcategory: category,
    image: cleanText(raw.image_url),
    status: 'Ativo',
    expiry: '',
    id: `OFF-${cleanText(raw.code) || `${category.toLowerCase().replaceAll(' ', '-')}-${index}`}`,
    createdAt: new Date().toISOString(),
    createdBy: 'Open Food Facts import',
    source: 'Open Food Facts',
  };
}

const products = await readProducts();
const existingIds = new Set(products.map((product) => product.id));
const productsByKey = new Map(products.map((product) => [productKey(product), product]));
const importedByCategory = {};

for (const source of categorySources) {
  const categoryProducts = [];
  const seen = new Set();
  for (const tag of source.tags) {
    let rawProducts = [];
    try {
      rawProducts = await fetchProducts(tag);
    } catch (error) {
      console.warn(error.message);
      continue;
    }
    for (const raw of rawProducts) {
      const title = cleanText(raw.product_name);
      const key = productKey(raw);
      if (!title || !key || seen.has(key)) continue;
      seen.add(key);
      const existingProduct = productsByKey.get(key);
      if (existingProduct) {
        existingProduct.categories = [...new Set([...(existingProduct.categories || []), source.name])];
        categoryProducts.push(existingProduct);
        if (categoryProducts.length >= minimumPerCategory) break;
        continue;
      }
      const product = normalizeProduct(raw, source.name, categoryProducts.length);
      if (existingIds.has(product.id)) continue;
      categoryProducts.push(product);
      existingIds.add(product.id);
      productsByKey.set(key, product);
      if (categoryProducts.length >= minimumPerCategory) break;
    }
    if (categoryProducts.length >= minimumPerCategory) break;
  }
  if (categoryProducts.length < minimumPerCategory) throw new Error(`${source.name}: encontrados apenas ${categoryProducts.length} produtos reais; carga interrompida.`);
  products.push(...categoryProducts);
  importedByCategory[source.name] = categoryProducts.length;
}

await fs.writeFile(productsFile, JSON.stringify(products, null, 2), 'utf8');
console.log(JSON.stringify({ totalProducts: products.length, importedByCategory }, null, 2));

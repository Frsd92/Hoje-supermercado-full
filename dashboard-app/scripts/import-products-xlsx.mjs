import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import XLSX from 'xlsx';

const inputArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const inputFile = path.resolve(inputArgument || 'cadastro_de_produto_preenchido_v2.xlsx');
const shouldApply = process.argv.includes('--apply');
const shouldReplaceXlsx = process.argv.includes('--replace-xlsx');
const productsFile = path.join(process.cwd(), 'data', 'products.json');

const normalizeKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const numberValue = (value) => {
  if (typeof value === 'number') return value;
  const normalized = cleanText(value).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return Number(normalized);
};

const aliases = {
  title: ['produto', 'nome', 'nomeproduto', 'nomedoproduto', 'descricao', 'descricaoproduto', 'productname'],
  sku: ['sku', 'codigo', 'codigoproduto', 'referencia', 'ref'],
  barcode: ['ean', 'gtin', 'barcode', 'codigobarras', 'codigodebarras'],
  brand: ['marca', 'fabricante', 'brand'],
  category: ['categoria', 'categorias', 'departamento', 'secao', 'category'],
  subcategory: ['subcategoria', 'subsecao', 'subcategory'],
  price: ['preco', 'precovenda', 'precodevenda', 'venda', 'valorvenda', 'price'],
  cost: ['custo', 'customedio', 'precocusto', 'custodecompra', 'cost'],
  markup: ['markup', 'markuppercentual'],
  quantity: ['estoque', 'quantidade', 'qtd', 'saldo', 'quantity'],
  discount: ['desconto', 'discount'],
  image: ['imagem', 'foto', 'urlimagem', 'image'],
  description: ['descricao', 'descricaoproduto', 'description'],
  supplier: ['fornecedor', 'supplier'],
  expiry: ['validade', 'datadevalidade', 'expiry'],
  location: ['localizacao', 'location'],
};

function getValue(row, normalizedHeaders, field) {
  const header = normalizedHeaders.find((item) => aliases[field].includes(item.normalized));
  return header ? row[header.original] : '';
}

async function readProducts() {
  try {
    const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

const workbook = XLSX.readFile(inputFile, { cellDates: false });
const sheetName = workbook.SheetNames[0];
if (!sheetName) throw new Error('A planilha não possui nenhuma aba.');

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
if (!rows.length) throw new Error('A primeira aba da planilha não possui produtos.');

const normalizedHeaders = Object.keys(rows[0]).map((original) => ({ original, normalized: normalizeKey(original) }));
const savedProducts = await readProducts();
const existingProducts = shouldReplaceXlsx ? savedProducts.filter((product) => !String(product.id || '').startsWith('XLSX-')) : savedProducts;
const existingKeys = new Set(existingProducts.flatMap((product) => [product.sku, product.barcode, product.title].map(normalizeKey).filter(Boolean)));
const importedProducts = [];
const skipped = [];

for (const [index, row] of rows.entries()) {
  const title = cleanText(getValue(row, normalizedHeaders, 'title'));
  const sku = cleanText(getValue(row, normalizedHeaders, 'sku'));
  const barcode = cleanText(getValue(row, normalizedHeaders, 'barcode'));
  const key = normalizeKey(barcode || sku || title);
  const costValue = numberValue(getValue(row, normalizedHeaders, 'cost'));
  const markupValue = numberValue(getValue(row, normalizedHeaders, 'markup'));
  const listedPrice = numberValue(getValue(row, normalizedHeaders, 'price'));
  const price = Number.isFinite(listedPrice) && listedPrice > 0
    ? listedPrice
    : Number.isFinite(costValue) && costValue > 0 && Number.isFinite(markupValue)
      ? Number((costValue * (1 + markupValue / 100)).toFixed(2))
      : NaN;
  if (!title || !key || !Number.isFinite(price) || price <= 0) {
    skipped.push({ row: index + 2, reason: 'nome, identificador ou preço inválido' });
    continue;
  }
  if (existingKeys.has(key)) {
    skipped.push({ row: index + 2, reason: 'produto já cadastrado' });
    continue;
  }

  const now = new Date().toISOString();
  const cost = costValue;
  const discount = numberValue(getValue(row, normalizedHeaders, 'discount'));
  const quantity = numberValue(getValue(row, normalizedHeaders, 'quantity'));
  const category = cleanText(getValue(row, normalizedHeaders, 'category')) || 'Mercearia';
  const product = {
    id: `XLSX-${key}`,
    title,
    description: cleanText(getValue(row, normalizedHeaders, 'description')) || 'Produto real importado do cadastro de produtos.',
    price,
    cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    discount: Number.isFinite(discount) && discount >= 0 ? Math.min(discount, 100) : 0,
    quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
    sku,
    barcode,
    brand: cleanText(getValue(row, normalizedHeaders, 'brand')),
    supplier: cleanText(getValue(row, normalizedHeaders, 'supplier')),
    categories: [category],
    subcategory: cleanText(getValue(row, normalizedHeaders, 'subcategory')) || category,
    image: cleanText(getValue(row, normalizedHeaders, 'image')),
    status: 'Ativo',
    expiry: cleanText(getValue(row, normalizedHeaders, 'expiry')),
    location: cleanText(getValue(row, normalizedHeaders, 'location')),
    createdAt: now,
    createdBy: 'Importação XLSX',
    priceHistory: [{ date: now, price, cost: Number.isFinite(cost) && cost >= 0 ? cost : 0, discount: 0, changedBy: 'Importação XLSX' }],
  };
  importedProducts.push(product);
  existingKeys.add(key);
}

console.log(JSON.stringify({ sheet: sheetName, rows: rows.length, readyToImport: importedProducts.length, skipped: skipped.length, skippedDetails: skipped.slice(0, 20), apply: shouldApply }, null, 2));

if (shouldApply) {
  await fs.mkdir(path.dirname(productsFile), { recursive: true });
  await fs.writeFile(productsFile, JSON.stringify([...existingProducts, ...importedProducts], null, 2), 'utf8');
  console.log(`Importados ${importedProducts.length} produtos em ${productsFile}.`);
} else {
  console.log('Prévia concluída. Para gravar, execute novamente com --apply.');
}
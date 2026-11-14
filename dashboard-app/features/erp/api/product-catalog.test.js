import assert from 'node:assert/strict';
import test from 'node:test';
import { getProductById, getPublicProductsByIds, serializeErpProductListRecord } from './product-catalog.js';

test('loads one product by its public ID without querying the complete catalog', async () => {
  let query;
  const product = await getProductById('store-product-1', {
    product: {
      async findFirst(value) {
        query = value;
        return {
          id: 'database-id',
          externalId: 'store-product-1',
          title: 'Produto',
          description: 'Descrição',
          price: '12.50',
          cost: '8.00',
          discount: '0',
          quantity: '4',
          barcode: '789123',
          productBarcodes: [{ code: '789123' }, { code: '789456' }],
          categories: ['Mercearia'],
          metadata: { saleUnit: 'Unidade', promotionalPrice: 10 },
          blingProductId: 'bling-123',
          blingSyncStatus: 'synced',
          blingSyncError: '',
          blingSyncVerifiedData: { fields: { ncm: '10063021' } },
          image: '/produto.webp',
          status: 'Ativo',
          expiry: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        };
      },
    },
  });

  assert.deepEqual(query.where.OR, [{ externalId: 'store-product-1' }, { id: 'store-product-1' }]);
  assert.deepEqual(query.include.productBarcodes, { select: { code: true } });
  assert.equal(product.id, 'store-product-1');
  assert.deepEqual(product.barcodes, ['789123', '789456']);
  assert.equal(product.saleUnit, 'Unidade');
  assert.deepEqual(product.blingSyncVerifiedData, { fields: { ncm: '10063021' } });
});

test('serializes ERP list rows with public image URLs instead of inline image data', () => {
  const product = serializeErpProductListRecord({
    id: 'database-id',
    externalId: 'store-product-1',
    title: 'Produto',
    price: '12.50',
    cost: '8.00',
    quantity: '4',
    sku: 'SKU-1',
    barcode: '789123',
    brand: 'Marca',
    subcategory: 'Alimentos',
    status: 'Ativo',
    blingSyncStatus: 'partial',
    blingSyncError: 'NCM não informado.',
    blingSyncVerifiedData: { fields: { sku: 'SKU-1' } },
    categories: ['Mercearia'],
    metadata: { saleUnit: 'Unidade', barcodes: ['789123', '789456'] },
    image: '',
    imageHash: 'a'.repeat(32),
  });

  assert.equal(product.id, 'store-product-1');
  assert.equal(product.image, `/api/products?purpose=image&id=store-product-1&v=${'a'.repeat(32)}-webp-256-v2`);
  assert.deepEqual(product.barcodes, ['789123', '789456']);
  assert.equal(product.saleUnit, 'Unidade');
  assert.equal(product.blingSyncStatus, 'partial');
  assert.deepEqual(product.blingSyncVerifiedData, { fields: { sku: 'SKU-1' } });
  assert.equal('promotionalPrice' in product, false);
  assert.equal('imageHash' in product, false);
});

test('loads only active public products requested by cart ID', async () => {
  let query;
  const products = await getPublicProductsByIds(['store-product-1', 'store-product-1'], {
    product: {
      async findMany(value) {
        query = value;
        return [{
          id: 'database-id',
          externalId: 'store-product-1',
          title: 'Produto',
          description: '',
          price: '12.50',
          discount: '0',
          status: 'Ativo',
          categories: ['Mercearia'],
          brand: '',
          subcategory: '',
          metadata: { saleUnit: 'Unidade', promotionalPrice: 10 },
          image: '',
          imageHash: '',
        }];
      },
    },
  });

  assert.deepEqual(query.where.OR, [
    { id: { in: ['store-product-1'] } },
    { externalId: { in: ['store-product-1'] } },
  ]);
  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'store-product-1');
  assert.equal(products[0].price, 12.5);
  assert.equal(products[0].promotionalPrice, 10);
});

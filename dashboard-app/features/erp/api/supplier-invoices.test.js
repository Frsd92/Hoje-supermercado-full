import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInvoiceProducts, parseSupplierInvoiceXml } from './supplier-invoices.js';

function buildAccessKey() {
  const body = '3526101234567800019555001000000123112345678';
  let weight = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return `${body}${remainder < 2 ? 0 : 11 - remainder}`;
}

function buildInvoiceXml({ model = '55', status = '100' } = {}) {
  const accessKey = buildAccessKey();
  return {
    accessKey,
    xml: `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <NFe><infNFe Id="NFe${accessKey}" versao="4.00">
        <ide><mod>${model}</mod><nNF>123</nNF><serie>1</serie><dhEmi>2026-10-11T10:00:00-03:00</dhEmi></ide>
        <emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor &amp; Cia</xNome></emit>
        <dest><CNPJ>98765432000110</CNPJ></dest>
        <det nItem="1"><prod><cProd>ITEM-1</cProd><cEAN>7891234567895</cEAN><xProd>Arroz</xProd><NCM>10063021</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>10.250000</vUnCom><vProd>20.50</vProd></prod></det>
        <total><ICMSTot><vNF>20.50</vNF></ICMSTot></total>
        <cobr><dup><nDup>001</nDup><dVenc>2026-11-10</dVenc><vDup>10.25</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-10</dVenc><vDup>10.25</vDup></dup></cobr>
      </infNFe></NFe>
      <protNFe><infProt><tpAmb>1</tpAmb><cStat>${status}</cStat><xMotivo>Autorizado o uso</xMotivo><chNFe>${accessKey}</chNFe><dhRecbto>2026-10-11T10:01:00-03:00</dhRecbto><nProt>135260000000001</nProt></infProt></protNFe>
    </nfeProc>`,
  };
}

test('parses NF-e identification, supplier, items and payment installments', () => {
  const parsed = parseSupplierInvoiceXml(buildInvoiceXml().xml);

  assert.equal(parsed.accessKey, buildInvoiceXml().accessKey);
  assert.equal(parsed.invoiceNumber, '123');
  assert.equal(parsed.issuerTaxId, '12345678000195');
  assert.equal(parsed.issuerName, 'Fornecedor &amp; Cia');
  assert.equal(parsed.authorized, true);
  assert.equal(parsed.authorizationDataComplete, true);
  assert.equal(parsed.protocolNumber, '135260000000001');
  assert.equal(parsed.total, '20.50');
  assert.equal(parsed.items[0].invoiceQuantity, '2.0000');
  assert.equal(parsed.items[0].unitPrice, '10.250000');
  assert.equal(parsed.installments.length, 2);
  assert.equal(parsed.installments[1].dueAt, '2026-12-10');
});

test('requires well-formed model-55 XML and rejects unsafe XML declarations', () => {
  const { xml } = buildInvoiceXml();
  assert.throws(() => parseSupplierInvoiceXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]>' + xml), /declarações não permitidas/);
  assert.throws(() => parseSupplierInvoiceXml(buildInvoiceXml({ model: '65' }).xml), /modelo 55/);
  assert.throws(() => parseSupplierInvoiceXml(xml.replace('<vNF>20.50</vNF>', '<vNF>20,50</vNF>')), /valor total/);
  assert.throws(() => parseSupplierInvoiceXml(xml.replace('Id="NFe', 'Id="NFe0')), /chave de acesso/);
});

test('keeps imported protocol status explicit instead of assuming authorization', () => {
  assert.equal(parseSupplierInvoiceXml(buildInvoiceXml({ status: '101' }).xml).authorized, false);
  const incompleteAuthorization = parseSupplierInvoiceXml(buildInvoiceXml().xml.replace(`<chNFe>${buildInvoiceXml().accessKey}</chNFe>`, ''));
  assert.equal(incompleteAuthorization.authorized, false);
  assert.equal(incompleteAuthorization.authorizationDataComplete, false);
  assert.equal(parseSupplierInvoiceXml('<NFe><infNFe Id="NFe' + buildInvoiceXml().accessKey + '" versao="4.00"><ide><mod>55</mod><nNF>123</nNF><serie>1</serie><dhEmi>2026-10-11T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor</xNome></emit><det nItem="1"><prod><cProd>1</cProd><xProd>Item</xProd><uCom>UN</uCom><qCom>1</qCom><vUnCom>1</vUnCom><vProd>1</vProd></prod></det><total><ICMSTot><vNF>1</vNF></ICMSTot></total></infNFe></NFe>').authorized, false);
});

test('matches only exact normalized product EANs', () => {
  const mapped = matchInvoiceProducts([
    { ean: '7891234567895' },
    { ean: '' },
  ], [
    { id: 'product-a', barcode: '7891234567895', productBarcodes: [] },
    { id: 'product-b', barcode: 'other', productBarcodes: [{ code: ' 789 000 000 0000 ' }] },
  ]);

  assert.equal(mapped[0].productId, 'product-a');
  assert.equal(mapped[1].productId, null);
});

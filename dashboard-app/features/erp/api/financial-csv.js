const accountNatures = new Map([
  ['EXPENSE', 'EXPENSE'],
  ['DESPESA', 'EXPENSE'],
  ['REVENUE', 'REVENUE'],
  ['RECEITA', 'REVENUE'],
  ['ASSET', 'ASSET'],
  ['ATIVO', 'ASSET'],
  ['LIABILITY', 'LIABILITY'],
  ['PASSIVO', 'LIABILITY'],
  ['EQUITY', 'EQUITY'],
  ['PATRIMONIOLIQUIDO', 'EQUITY'],
]);

const expenseBehaviors = new Map([
  ['FIXED', 'FIXED'],
  ['FIXA', 'FIXED'],
  ['VARIABLE', 'VARIABLE'],
  ['VARIAVEL', 'VARIABLE'],
  ['FINANCIAL', 'FINANCIAL'],
  ['FINANCEIRA', 'FINANCIAL'],
  ['TAX', 'TAX'],
  ['TRIBUTARIA', 'TAX'],
  ['OTHER', 'OTHER'],
  ['OUTRA', 'OTHER'],
]);

function normalizeHeader(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvRows(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('O CSV contém uma aspa sem fechamento.');
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

export function parseChartAccountsCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Selecione um arquivo CSV preenchido.');
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e ao menos uma conta.');
  if (rows.length > 501) throw new Error('O arquivo pode conter no máximo 500 contas por importação.');

  const headers = rows[0].map(normalizeHeader);
  const column = (names) => headers.findIndex((header) => names.includes(header));
  const codeIndex = column(['codigo', 'code']);
  const nameIndex = column(['nome', 'name']);
  const natureIndex = column(['natureza', 'nature']);
  const behaviorIndex = column(['comportamento', 'comportamentodespesa', 'expensebehavior']);
  if ([codeIndex, nameIndex, natureIndex, behaviorIndex].some((index) => index < 0)) {
    throw new Error('O CSV deve ter as colunas codigo, nome, natureza e comportamento.');
  }

  const codes = new Set();
  return rows.slice(1).map((values, index) => {
    const line = index + 2;
    const code = values[codeIndex] || '';
    const name = values[nameIndex] || '';
    const natureValue = normalizeHeader(values[natureIndex] || '').toUpperCase();
    const behaviorValue = normalizeHeader(values[behaviorIndex] || '').toUpperCase();
    const nature = accountNatures.get(natureValue);
    const expenseBehavior = behaviorValue ? expenseBehaviors.get(behaviorValue) : null;

    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/.test(code)) throw new Error(`Linha ${line}: código inválido.`);
    if (!name || name.length > 120) throw new Error(`Linha ${line}: informe um nome com até 120 caracteres.`);
    if (!nature) throw new Error(`Linha ${line}: natureza inválida.`);
    if (nature === 'EXPENSE' && !expenseBehavior) throw new Error(`Linha ${line}: informe um comportamento de despesa válido.`);
    if (nature !== 'EXPENSE' && behaviorValue) throw new Error(`Linha ${line}: comportamento só pode ser preenchido para despesas.`);
    if (codes.has(code)) throw new Error(`O código ${code} aparece mais de uma vez no CSV.`);
    codes.add(code);
    return { code, name, nature, expenseBehavior: nature === 'EXPENSE' ? expenseBehavior : null };
  });
}

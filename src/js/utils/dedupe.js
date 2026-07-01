
export const emptyParseResult = Object.freeze({
  rows: [],
  warnings: [],
  ignoredRows: 0,
  ignoredLines: 0,
  pagesRead: 0,
  source: '',
});
export function deduplicateByFields(rows, fields) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const key = fields.map(field => String(row[field] ?? '')).join('|');
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(row);
  }

  return result;
}

export const HOSPITAL_DEDUPE_KEY = [
  'registro',
  'contaFatura',
  'dataPagamento',
  'horaPagamento',
  'autorizador',
  'autorizadorDoc',
  'valorCartao',
  'valorDinheiro',
  'valorFatura',
  'bandeira',
  'formaPagamento',
  'parcelas',
  'lote',
  'caixa',
];

export const CIELO_DEDUPE_KEY = [
  'autorizador', 'valorBruto', 'bandeira',
  'dataVenda', 'horaVenda', 'nsu', 'numeroMaquina',
];

export const CROSS_SOURCE_DEDUPE_KEY = ['origem', ...HOSPITAL_DEDUPE_KEY];

export function deduplicateHospitalRows(rows) {
  return deduplicateByFields(rows, HOSPITAL_DEDUPE_KEY);
}

export function deduplicateCrossSourceRows(rows) {
  return deduplicateByFields(rows, CROSS_SOURCE_DEDUPE_KEY);
}

export function findDuplicateAutorizadores(rows) {
  const counts = new Map();
  for (const row of rows) {
    const auth = String(row?.autorizador ?? '').trim();
    if (!auth) continue;
    counts.set(auth, (counts.get(auth) || 0) + 1);
  }
  const duplicates = new Set();
  for (const [auth, count] of counts) {
    if (count > 1) duplicates.add(auth);
  }
  return duplicates;
}

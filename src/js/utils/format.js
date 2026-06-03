export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[c]));
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeHeader(value) {
  return normalizeText(value);
}

export function normalizeAuth(value) {
  const raw = String(value ?? '').replace(/\.0$/, '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  return /^\d+$/.test(compact) ? compact.padStart(6, '0') : compact.toUpperCase();
}

export function parseMoneyBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? '').replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!raw) return 0;
  raw = raw.replace(/[^\d,.-]/g, '');
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseMoneyBRStrict(value) {
  if (typeof value === 'number') {
    return { value: Number.isFinite(value) ? value : 0, valid: Number.isFinite(value) };
  }

  const original = String(value ?? '').trim();
  if (!original) return { value: 0, valid: false };

  const compact = original.replace(/R\$/gi, '').replace(/\s/g, '');
  const hasOnlyMoneyChars = compact === compact.replace(/[^\d,.-]/g, '');
  const ptBrFormat = /^-?(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/.test(compact);
  const decimalDotFormat = /^-?\d+(\.\d{1,2})?$/.test(compact);
  const valid = hasOnlyMoneyChars && (ptBrFormat || decimalDotFormat);

  return { value: valid ? parseMoneyBR(original) : 0, valid };
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function normalizePaymentMethod(value) {
  const n = normalizeText(value).toUpperCase();
  if (!n) return '';
  if (n.includes('ESPECIE') || n.includes('DINHEIRO')) return 'ESPÉCIE';
  if (n.includes('CRED')) return 'CRÉDITO';
  if (n.includes('DEB')) return 'DÉBITO';
  return String(value).trim().toUpperCase();
}

export function normalizeCardType(value) {
  const method = normalizePaymentMethod(value);
  return method === 'CRÉDITO' || method === 'DÉBITO' ? method : '';
}

export function normalizeBrand(value) {
  const n = String(value ?? '').trim();
  return n ? n.toUpperCase() : '';
}

export function createId(prefix, index) {
  return (crypto.randomUUID && crypto.randomUUID()) || `${prefix}-${Date.now()}-${index}`;
}

export function getValue(row, candidates) {
  const normalized = new Map(Object.keys(row).map(k => [normalizeHeader(k), k]));
  for (const candidate of candidates) {
    const key = normalized.get(normalizeHeader(candidate));
    if (key !== undefined) return row[key];
  }
  return '';
}

export function getValueContains(row, terms) {
  for (const key of Object.keys(row)) {
    const nk = normalizeHeader(key);
    if (terms.some(term => nk.includes(normalizeHeader(term)))) return row[key];
  }
  return '';
}

export function isSummaryRow(row) {
  const combined = normalizeText(Object.values(row).join(' '));
  return combined.startsWith('total')
    || combined.includes('total de documentos')
    || combined.includes('saldo final')
    || combined.includes('saldo inicial');
}

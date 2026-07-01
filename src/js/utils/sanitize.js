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
  return String(value ?? '').replace(/[&<>"'`]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    "'": '&#39;', '"': '&quot;', '`': '&#96;',
  }[c]));
}

const XLSX_MAX_CELL_LENGTH = 32767;

const FORMULA_LEADING_CHARS = new Set(['=', '+', '-', '@', '\t', '\r', '\n', '\v', '\f']);

export function sanitizeXlsxCellValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (!str) return '';
  let sanitized = str;
  let i = 0;
  while (i < str.length && str.charCodeAt(i) === 0x20) i++;
  if (i < str.length && FORMULA_LEADING_CHARS.has(str[i])) {
    sanitized = "'" + str;
  }
  if (sanitized.length > XLSX_MAX_CELL_LENGTH) {
    sanitized = sanitized.slice(0, XLSX_MAX_CELL_LENGTH);
  }
  return sanitized;
}
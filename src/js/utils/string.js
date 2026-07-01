const RE_ACCENT = /[\u0300-\u036f]/g;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(RE_ACCENT, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const normalizeHeader = normalizeText;

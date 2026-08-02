const RE_DANGEROUS_CHARS = /[&<>"'`=;(){}[\]]/;
const RE_NUMERIC_ONLY = /^\d+$/;
const RE_COMPOUND_AUTH = /(\d{6})$/;

const RE_RS_PREFIX = /R\$/gi;
const RE_NON_MONEY = /[^\d,.-]/g;
const RE_PTBR_THOUSAND_DECIMAL = /^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
const RE_PTBR_INTEGER = /^-?\d{1,3}(\.\d{3})+$/;
const RE_US_THOUSAND_DECIMAL = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
const RE_STRICT_PTBR = /^-?(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/;
const RE_STRICT_DECIMAL = /^-?\d+(\.\d{1,2})?$/;

const RE_ESPECIE = /^(ESP[ÉE]CIE|DINHEIRO)/i;
const RE_CREDITO = /CR[ÉE]DITO/i;
const RE_DEBITO = /D[EÉ]BITO/i;

import { normalizeText, normalizeHeader } from './string.js';

const MAX_AUTH_LEN = 50;

export function normalizeAuth(value) {
  const raw = String(value ?? '').replace(/\.0$/, '').trim();
  if (!raw) return '';
  if (RE_DANGEROUS_CHARS.test(raw)) {
    const firstChar = raw[0];
    const category = /[=<>]/.test(firstChar) ? 'formula' : /[(){}\[\]]/.test(firstChar) ? 'bracket' : 'html';
    console.warn(`[normalizeAuth] Caractere perigoso detectado (${raw.length} chars, categoria: ${category}).`);
    return '';
  }
  const sanitized = raw;
  if (!sanitized) return '';
  const compact = sanitized.replace(/\s+/g, '');
  if (RE_NUMERIC_ONLY.test(compact)) return compact;
  const compound = sanitized.match(RE_COMPOUND_AUTH);
  if (compound) return compound[1];
  return compact.toUpperCase().substring(0, MAX_AUTH_LEN);
}

function parseMoneyRaw(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const originalString = String(value ?? '');
  if (/\s/.test(originalString.replace(RE_RS_PREFIX, ''))) {
    console.warn(`[parseMoneyBR] whitespace detectado em valor monetário (${originalString.length} chars). Concatenação silenciosa pode inflar valor.`);
  }
  const raw = originalString.replace(RE_RS_PREFIX, '').replace(/\s/g, '').trim();
  if (!raw) return null;
  const stripped = raw.replace(RE_NON_MONEY, '');
  if (RE_PTBR_THOUSAND_DECIMAL.test(stripped)) {
    return parseFloat(stripped.replace(/\./g, '').replace(',', '.'));
  }
  if (RE_PTBR_INTEGER.test(stripped)) {
    return parseFloat(stripped.replace(/\./g, ''));
  }
  if (RE_US_THOUSAND_DECIMAL.test(stripped)) {
    return parseFloat(stripped.replace(/,/g, ''));
  }
  const normalized = stripped.includes(',') ? stripped.replace(/\./g, '').replace(',', '.') : stripped;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseMoneyBR(value) {
  return parseMoneyRaw(value) ?? 0;
}

export function parseMoneyBRStrict(value) {
  const n = parseMoneyRaw(value);
  if (n !== null) return { value: n, valid: true };
  if (typeof value === 'number') return { value: 0, valid: false };
  const original = String(value ?? '').trim();
  if (!original) return { value: 0, valid: false };

  const compact = original.replace(RE_RS_PREFIX, '').replace(/\s/g, '');
  const hasOnlyMoneyChars = compact === compact.replace(RE_NON_MONEY, '');
  const ptBrFormat = RE_STRICT_PTBR.test(compact);
  const usThousandFormat = RE_US_THOUSAND_DECIMAL.test(compact);
  const decimalDotFormat = RE_STRICT_DECIMAL.test(compact);
  const valid = hasOnlyMoneyChars && (ptBrFormat || usThousandFormat || decimalDotFormat);

  return { value: valid ? parseMoneyRaw(original) ?? 0 : 0, valid };
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function normalizePaymentMethod(value) {
  value = value ?? '';
  const n = normalizeText(value).toUpperCase();
  if (!n) return '';
  if (RE_ESPECIE.test(n)) return 'ESPÉCIE';
  if (RE_CREDITO.test(n) && !RE_DEBITO.test(n)) return 'CRÉDITO';
  if (RE_DEBITO.test(n)) return 'DÉBITO';
  return '';
}

export function normalizeCardType(value) {
  const method = normalizePaymentMethod(value);
  return method === 'CRÉDITO' || method === 'DÉBITO' ? method : '';
}

export function normalizeBrand(value) {
  const n = String(value ?? '').trim();
  return n ? n.toUpperCase() : '';
}

const _CONTA_FATURA_RPS = Object.freeze(['Número Fatura RPS', 'Numero Fatura RPS']);
const _CONTA_FATURA_NFE = Object.freeze(['Número Fatura NFE', 'Numero Fatura NFE']);

export const HEADER_ALIASES = Object.freeze({
  autorizador: ['Código de autorização', 'Codigo de Autorização', 'Codigo de autorizacao', 'Código de autorizacao'],
  numeroMaquina: ['Número da máquina', 'Numero da maquina', 'Número máquina', 'Numero maquina', 'Máquina', 'Maquina'],
  valorCartao: ['Valor Cartão', 'Valor Cartao'],
  valorDinheiro: ['Valor Dinheiro'],
  valorFatura: ['Valor Fatura'],
  valorBruto: ['Valor bruto', 'Valor'],
  dataPagamento: ['Data Pagamento'],
  registro: ['Número Registro', 'Numero Registro'],
  atendimento: ['Número Atendimento', 'Numero Atendimento', 'Atendimento', 'Número Registro', 'Numero Registro'],
  caixa: ['Caixa'],
  lote: ['Lote'],
  contaFaturaRps: _CONTA_FATURA_RPS,
  contaFaturaNfe: _CONTA_FATURA_NFE,
  contaFatura: [..._CONTA_FATURA_RPS, ..._CONTA_FATURA_NFE],
  formaPagamento: ['Forma de pagamento'],
  debitoCredito: ['Débito/ Crédito', 'Débito/Crédito', 'Debito/ Credito', 'Forma de pagamento'],
  bandeira: ['Bandeira'],
  parcelas: ['Parcelas', 'Quantidade de parcelas', 'Quantidade total de parcelas', 'Qtd parcelas', 'Número de parcelas', 'Numero de parcelas', 'Plano'],
  dataVenda: ['Data da venda'],
  horaVenda: ['Hora da venda'],
  dataPrevistaPagamento: ['Data prevista do pagamento'],
  nsu: ['NSU/DOC', 'NSU'],
});

function resolveAliases(candidates) {
  return candidates.flatMap(candidate => HEADER_ALIASES[candidate] ?? [candidate]);
}

export function getValue(row, candidates, normalizedMap) {
  const aliases = resolveAliases(candidates);
  if (normalizedMap) {
    for (const alias of aliases) {
      const key = normalizedMap.get(normalizeHeader(alias));
      if (key !== undefined) return row[key];
    }
    return '';
  }
  const normalized = new Map(Object.keys(row).map(k => [normalizeHeader(k), k]));
  for (const alias of aliases) {
    const key = normalized.get(normalizeHeader(alias));
    if (key !== undefined) return row[key];
  }
  return '';
}

export function getValueContains(row, terms, normalizedMap) {
  const termNorms = terms.map(normalizeHeader);
  if (normalizedMap) {
    for (const [normKey, origKey] of normalizedMap) {
      for (let i = 0; i < termNorms.length; i++) {
        if (normKey.includes(termNorms[i])) return row[origKey];
      }
    }
    return '';
  }
  for (const key of Object.keys(row)) {
    const nk = normalizeHeader(key);
    for (let i = 0; i < termNorms.length; i++) {
      if (nk.includes(termNorms[i])) return row[key];
    }
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

export function getString(row, candidates, normalizedMap) {
  return String(getValue(row, candidates, normalizedMap) ?? '').trim();
}

export function getMoney(row, candidates, normalizedMap) {
  return parseMoneyBR(getValue(row, candidates, normalizedMap));
}

export function createId(prefix, index) {
  if (index !== undefined) {
    return `${prefix}-${index}`;
  }
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function normalizePdfBrand(value) {
  const text = String(value ?? '').replace(/-+$/, '').trim();
  const normalized = normalizeText(text);
  if (normalized.includes('american express')) return 'AMERICAN EXPRESS';
  if (normalized.includes('master')) return 'MASTERCARD';
  if (normalized.includes('visa')) return 'VISA';
  if (normalized.includes('elo')) return 'ELO';
  if (normalized.includes('hiper')) return 'HIPERCARD';
  return normalizeBrand(text.split(' - ')[0]);
}

// Força formato canônico brasileiro dd/mm/yyyy para qualquer string de data
// que chegue em variantes conhecidas. Entrada esperada: BI/MV e Cielo entregam
// em formato BR (dd/mm/yyyy) — esta função padroniza e devolve texto.
// Apenas formato brasileiro (dd/mm/yyyy) é aceito; formatos ambíguos
// como mm/dd/yyyy são rejeitados (retornam vazio) para evitar inversão silenciosa.
export function normalizeDateBR(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value).trim();

  // dd/mm/yyyy com 4 dígitos no ano
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, a, b, yyyy] = m;
    const day = Number(a), month = Number(b);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${a.padStart(2, '0')}/${b.padStart(2, '0')}/${yyyy}`;
    }
    // Mês > 12 indica formato não-BR (ex: mm/dd/yyyy). Rejeitado.
    return '';
  }

  // dd/mm/yy com ano de 2 dígitos
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const [, a, b, yy] = m;
    const day = Number(a), month = Number(b);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const yyyy = (Number(yy) <= 69 ? '20' : '19') + yy;
      return `${a.padStart(2, '0')}/${b.padStart(2, '0')}/${yyyy}`;
    }
    return '';
  }

  // ISO yyyy-mm-dd
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Sem matches: devolve input original (caller decide)
  return str;
}

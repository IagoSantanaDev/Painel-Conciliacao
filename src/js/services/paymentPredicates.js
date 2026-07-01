import { normalizeText } from '../utils/string.js';

export const STATUS_LABEL = Object.freeze({
  CONCILIADO: 'Conciliado',
  CORRIGIDO: 'Corrigido',
  DIVERGENTE: 'Divergente',
  PENDENTE: 'Pendente',
  NAO_ENCONTRADO: 'Não encontrado',
  NAO_ENCONTRADO_CIELO: 'Não encontrado no sistema',
  DINHEIRO: 'Dinheiro',
  DINHEIRO_DIFERENCA: 'Dinheiro Diferença',
  PAGAMENTO_MISTO: 'Pagamento misto',
});

export const SHEET_NAME = Object.freeze({
  CONCILIADOS: 'Conciliados',
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro',
  DIVERGENTES: 'Divergentes',
  NAO_ENCONTRADO: 'Não encontrado',
  PENDENTES: 'Pendentes',
});

export const SHEET_ORDER = Object.freeze([
  SHEET_NAME.CONCILIADOS,
  SHEET_NAME.CARTAO,
  SHEET_NAME.DINHEIRO,
  SHEET_NAME.DIVERGENTES,
  SHEET_NAME.NAO_ENCONTRADO,
  SHEET_NAME.PENDENTES,
]);

export const BLOCKING_KEYWORDS = Object.freeze([
  'Divergência',
  STATUS_LABEL.DIVERGENTE,
  STATUS_LABEL.NAO_ENCONTRADO,
  'Pendente',
  'Sem autorizador',
  'Sem valor',
]);

export const EVENTO_PARTICULAR = 'Particular';

export const FILTERS = Object.freeze([
  { key: 'todos', label: 'Todos', predicate: row => !isCieloOnly(row) },
  { key: 'conciliado', label: 'Conciliados', predicate: row => !isCieloOnly(row) && isOkRowBridge(row) },
  { key: 'corrigido', label: 'Corrigidos', predicate: row => !isCieloOnly(row) && isCorrigido(row) },
  { key: 'cartao', label: 'Cartão', predicate: row => !isCieloOnly(row) && isCardPayment(row) },
  { key: 'credito', label: 'Crédito', predicate: row => !isCieloOnly(row) && isCardType(row, 'credito') },
  { key: 'debito', label: 'Débito', predicate: row => !isCieloOnly(row) && isCardType(row, 'debito') },
  { key: 'dinheiro', label: 'Dinheiro/Espécie', predicate: row => !isCieloOnly(row) && isCashPayment(row) },
  { key: 'divergente', label: 'Divergentes', predicate: row => !isCieloOnly(row) && isDivergente(row) },
  { key: 'naoEncontrado', label: 'Não Encontrados', predicate: isNaoEncontrado },
  { key: 'pendente', label: 'Pendentes', predicate: row => !isCieloOnly(row) && isPendente(row) },
]);

export function isOkRowBridge(row) {
  const isCorrectedMoney = isCorrigido(row) && row.status?.some(s => s.includes('Dinheiro') || s.includes('Pagamento misto'));
  return isOkRow(row) && !isCorrectedMoney;
}

export function isNaoEncontrado(row) {
  return isCieloOnly(row) || row.statusLabel === STATUS_LABEL.NAO_ENCONTRADO;
}

export function isCieloOnly(row) {
  return row.cieloOnly === true;
}

export function isCorrigido(row) {
  return row.corrigido === true;
}

export function isOkRow(row) {
  if (row.corrigido === true) return true;
  return row.statusLabel === STATUS_LABEL.CONCILIADO && !hasBlockingStatus(row);
}

export function isDivergente(row) {
  return !isCorrigido(row) && row.statusLabel === STATUS_LABEL.DIVERGENTE;
}

export function isPendente(row) {
  return !isCorrigido(row) && row.statusLabel === STATUS_LABEL.PENDENTE;
}

export function containsBlockingKeyword(s) {
  return BLOCKING_KEYWORDS.some(keyword => s.includes(keyword));
}

export function hasBlockingStatus(row) {
  return (row.status || []).some(containsBlockingKeyword);
}

export function isCardType(row, type) {
  const haystack = normalizeText([
    row.tipoCartao,
    row.formaPagamento,
    row.bandeira,
    row.cielo?.formaPagamento,
  ].filter(Boolean).join(' '));
  return haystack.includes(type);
}

export function isCardPayment(row) {
  if (isCieloOnly(row)) return false;
  return row.valorCartao > 0 || isCardType(row, 'credito') || isCardType(row, 'debito');
}

export function isCashPayment(row) {
  if (isCieloOnly(row)) return false;
  return row.valorDinheiro > 0
    || row.statusLabel === STATUS_LABEL.DINHEIRO
    || row.statusLabel === STATUS_LABEL.PAGAMENTO_MISTO
    || (row.status || []).some(s => String(s).includes('À Conciliar'));
}

export function buildConsumedCieloIds(rows, exceptIndex) {
  return new Set(
    rows
      .filter((_, i) => i !== exceptIndex && !isCieloOnly(rows[i]) && !isCorrigido(rows[i]))
      .map(row => row.cielo?.idInterno)
      .filter(Boolean)
  );
}

export function withCieloFallback(row) {
  if (!row.cielo) return row;
  return { ...row.cielo, ...row };
}

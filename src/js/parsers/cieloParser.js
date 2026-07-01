import { isSpreadsheetFile } from '../utils/fileExt.js';
import { CIELO_DEDUPE_KEY, deduplicateByFields } from '../utils/dedupe.js';
import {
  createId,
  getMoney,
  getString,
  getValue,
  normalizeAuth,
  normalizeBrand,
  normalizePaymentMethod,
} from '../utils/format.js';
import { parseSpreadsheet } from './_shared.js';
import { ID_PREFIX } from '../constants.js';

const HEADER_TOKENS = [
  ['data da venda'],
  ['valor bruto'],
  ['codigo de autorizacao'],
];

export async function parseCielo(file) {
  if (!isSpreadsheetFile(file)) throw new Error('Cielo: extensão não suportada.');

  const { rows: sales, ignored: ignoredRows, truncatedMsg } = await parseSpreadsheet(file, HEADER_TOKENS, 'Cielo', (row, index, norm) =>
    mapCieloRow(row, index, norm)
  );

  if (!sales.some(sale => sale.autorizador)) {
    throw new Error('A planilha Cielo não possui coluna de autorização reconhecida.');
  }

  const deduplicated = deduplicateByFields(sales, CIELO_DEDUPE_KEY);
  const warnings = truncatedMsg ? [truncatedMsg] : [];

  return { rows: deduplicated, warnings, ignoredRows, source: 'CIELO' };
}

function mapCieloRow(row, index, norm) {
  const autorizador = normalizeAuth(getValue(row, ['autorizador'], norm));
  const valorBruto = getMoney(row, ['valorBruto'], norm);
  if (!autorizador && valorBruto === 0) return null;

  return {
    idInterno: createId(ID_PREFIX.CIELO, index),
    autorizador,
    valorBruto,
    bandeira: normalizeBrand(getValue(row, ['bandeira'], norm)),
    formaPagamento: normalizePaymentMethod(getValue(row, ['formaPagamento'], norm)),
    parcelas: getCieloInstallments(row, norm),
    dataVenda: getString(row, ['dataVenda'], norm),
    horaVenda: getString(row, ['horaVenda'], norm),
    dataPrevistaPagamento: getString(row, ['dataPrevistaPagamento'], norm),
    nsu: getString(row, ['nsu'], norm),
    numeroMaquina: getString(row, ['numeroMaquina'], norm),
    raw: row,
  };
}

function getCieloInstallments(row, norm) {
  const value = getValue(row, ['parcelas'], norm);
  if (value) return String(value).trim();

  const forma = String(getValue(row, ['formaPagamento'], norm) || '');
  const match = forma.match(/(\d+)\s*x/i);
  return match ? match[1] : '';
}

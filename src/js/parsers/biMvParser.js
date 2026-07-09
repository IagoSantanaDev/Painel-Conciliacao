import { deduplicateHospitalRows } from '../utils/dedupe.js';
import { isSpreadsheetFile } from '../utils/fileExt.js';
import {
  getMoney,
  getString,
  getValue,
  getValueContains,
  isSummaryRow,
  normalizeAuth,
  normalizeBrand,
  normalizeCardType,
  normalizeDateBR,
  normalizePaymentMethod,
} from '../utils/format.js';
import { createHospitalRow, parseSpreadsheet } from './_shared.js';
import { ID_PREFIX } from '../constants.js';

const AUTORIZADOR_HEADERS = ['Autorizador', 'Código de autorização'];

const HEADER_TOKENS = [
  ['valor fatura'],
  ['valor cartao', 'valor dinheiro'],
  ['lote', 'numero registro', 'data pagamento', 'autorizador'],
];

export async function parseBiMv(file) {
  if (!isSpreadsheetFile(file)) throw new Error('BI/MV: extensão não suportada.');

  const { rows: mappedRows, ignored: ignoredRows, truncatedMsg } = await parseSpreadsheet(file, HEADER_TOKENS, 'BI', (row, index, norm) => {
    if (isSummaryRow(row)) return null;
    return mapBiRow(row, index, norm);
  });

  const deduplicated = deduplicateHospitalRows(mappedRows);
  const warnings = truncatedMsg ? [truncatedMsg] : [];

  return { rows: deduplicated, warnings, ignoredRows, source: 'BI_MV' };
}

function mapBiRow(row, index, norm) {
  const valorCartao = getMoney(row, ['valorCartao'], norm);
  const valorDinheiro = getMoney(row, ['valorDinheiro'], norm);
  const valorFatura = getMoney(row, ['valorFatura'], norm);
  const registro = getString(row, ['registro'], norm);
  if (!registro && valorCartao === 0 && valorDinheiro === 0 && valorFatura === 0) return null;

  const formaRaw = getValue(row, ['debitoCredito'], norm);
  const bandeira = getValue(row, ['bandeira'], norm);

  return createHospitalRow({
    idPrefix: ID_PREFIX.BI,
    index,
    dataPagamento: normalizeDateBR(getString(row, ['dataPagamento'], norm)),
    registro,
    caixa: getString(row, ['caixa'], norm),
    lote: getString(row, ['lote'], norm),
    contaFatura: getString(row, ['contaFatura'], norm),
    autorizador: normalizeAuth(getValue(row, AUTORIZADOR_HEADERS, norm)),

    autorizadorDoc: getString(row, ['Autorizador Doc.'], norm),
    valorCartao,
    valorDinheiro,
    valorFatura,
    desconto: getValueContains(row, ['desconto'], norm),
    formaPagamento: normalizePaymentMethod(formaRaw),
    tipoCartao: normalizeCardType(formaRaw),
    bandeira: normalizeBrand(bandeira),
    parcelas: getString(row, ['parcelas'], norm),
    raw: row,
  });
}

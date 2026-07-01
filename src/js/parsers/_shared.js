import { createId } from '../utils/format.js';
import { MAX_WORKBOOK_ROWS } from './fileReaders.js';
import { normalizeText } from '../utils/string.js';
import { ID_PREFIX } from '../constants.js';
import { isCsvFile } from '../utils/fileExt.js';
import { parseCsvRows, parseWorkbookRows, rowsToObjects } from './fileReaders.js';

function buildHeaderNormalizer(headerKeys) {
  return new Map(headerKeys.map(k => [normalizeText(k), k]));
}

export function findHeaderRowByTokens(rows, tokenGroups) {
  return rows.findIndex(row => {
    const headers = row.map(normalizeText);
    return tokenGroups.every(group =>
      group.some(token => headers.some(h => h.includes(token)))
    );
  });
}

export function assertHeaderFound(headerIndex, parserName) {
  if (headerIndex < 0) {
    throw new Error(`Não foi possível identificar o cabeçalho da planilha ${parserName}.`);
  }
}

export async function parseSpreadsheet(file, headerTokens, parserName, rowMapper) {
  const raw = isCsvFile(file) ? await parseCsvRows(file) : await parseWorkbookRows(file);

  const rows = Array.isArray(raw) ? raw : raw.rows;
  const truncated = !Array.isArray(raw) && raw.truncated;
  const headerIndex = findHeaderRowByTokens(rows, headerTokens);
  assertHeaderFound(headerIndex, parserName);
  const objects = rowsToObjects(rows, headerIndex);

  const allKeys = new Set();
  for (const row of objects) {
    for (const key of Object.keys(row)) allKeys.add(key);
  }
  const headerNormalizer = buildHeaderNormalizer([...allKeys]);
  const mapped = objects.map((row, index) => rowMapper(row, index, headerNormalizer));
  const ignored = mapped.filter(r => r === null).length;
  const truncatedMsg = truncated
    ? `Planilha com mais de ${MAX_WORKBOOK_ROWS} linhas — primeiras ${MAX_WORKBOOK_ROWS} processadas.`
    : null;
  return { rows: mapped.filter(Boolean), ignored, truncatedMsg };
}

export function createHospitalRow({ idPrefix, index, dataPagamento = '', horaPagamento = '',
  registro = '', caixa = '', lote = '', contaFatura = '', autorizador = '',
  autorizadorDoc = '',
  valorCartao = 0, valorDinheiro = 0, valorFatura = 0, desconto = '',
  formaPagamento = '', tipoCartao = '', bandeira = '', parcelas = '',
  observacoes = [], raw = {}, } = {}) {
  return {
    idInterno: createId(idPrefix, index),
    origem: idPrefix === ID_PREFIX.PDF_CARD || idPrefix === ID_PREFIX.PDF_CASH ? 'PDF_TASY' : 'BI_MV',
    dataPagamento, horaPagamento, registro, caixa, lote, contaFatura, autorizador,
    autorizadorDoc,
    valorCartao, valorDinheiro, valorFatura, desconto,
    formaPagamento, tipoCartao, bandeira, parcelas, observacoes, raw,
  };
}

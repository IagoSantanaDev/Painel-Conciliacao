import {
  createId,
  getValue,
  normalizeAuth,
  normalizeBrand,
  normalizeHeader,
  normalizePaymentMethod,
  parseMoneyBR,
} from '../utils/format.js';
import { parseCsvRows, parseWorkbookRows, rowsToObjects } from './fileReaders.js';

const CSV_EXTENSION = 'csv';
const CIELO_SPREADSHEET_EXTENSIONS = new Set(['csv', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods']);

/** Deduplica vendas pelo autorizador + campos relevantes. Duplicatas verdadeiras (mesmo autorizador + mesmos valores) são removidas. */
function deduplicateSales(sales) {
  const seen = new Map();
  const result = [];
  for (const sale of sales) {
    const key = [
      sale.autorizador,
      sale.valorBruto,
      sale.bandeira,
      sale.formaPagamento,
      sale.parcelas,
      sale.dataVenda,
      sale.horaVenda,
      sale.nsu,
      sale.numeroMaquina,
    ].join('|');
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(sale);
    }
  }
  return result;
}

export async function parseCielo(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!CIELO_SPREADSHEET_EXTENSIONS.has(ext)) {
    throw new Error('Use CSV, XLSX, XLS, XLSM, XLSB ou ODS no arquivo Cielo.');
  }

  const rows = ext === CSV_EXTENSION ? await parseCsvRows(file) : await parseWorkbookRows(file);
  const headerIndex = findCieloHeaderRow(rows);
  if (headerIndex < 0) throw new Error('A planilha Cielo não possui cabeçalho de vendas reconhecido.');

  const objects = rowsToObjects(rows, headerIndex);
  const sales = objects.map((row, index) => mapCieloRow(row, index)).filter(Boolean);
  if (!sales.some(sale => sale.autorizador)) throw new Error('A planilha Cielo não possui coluna de autorização reconhecida.');
  const deduplicated = deduplicateSales(sales);

  return { rows: deduplicated, warnings: [], ignoredRows: headerIndex, source: 'CIELO' };
}

function findCieloHeaderRow(rows) {
  return rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    const hasSaleDate = headers.some(header => header.includes('data da venda'));
    const hasGrossValue = headers.some(header => header.includes('valor bruto') || header === 'valor');
    const hasAuthorization = headers.some(header => header.includes('codigo de autorizacao'));
    return hasSaleDate && hasGrossValue && hasAuthorization;
  });
}

function mapCieloRow(row, index) {
  const autorizador = normalizeAuth(getValue(row, ['Código de autorização', 'Codigo de Autorização', 'Codigo de autorizacao', 'Código de autorizacao']));
  const valorBruto = parseMoneyBR(getValue(row, ['Valor bruto', 'Valor']));
  if (!autorizador && valorBruto === 0) return null;

  return {
    idInterno: createId('cielo', index),
    autorizador,
    valorBruto,
    bandeira: normalizeBrand(getValue(row, ['Bandeira'])),
    formaPagamento: normalizePaymentMethod(getValue(row, ['Forma de pagamento'])),
    parcelas: getCieloInstallments(row),
    dataVenda: String(getValue(row, ['Data da venda']) || '').trim(),
    horaVenda: String(getValue(row, ['Hora da venda']) || '').trim(),
    dataPrevistaPagamento: String(getValue(row, ['Data prevista do pagamento']) || '').trim(),
    nsu: String(getValue(row, ['NSU/DOC', 'NSU']) || '').trim(),
    numeroMaquina: String(getValue(row, ['Número da máquina', 'Numero da maquina', 'Número máquina', 'Numero maquina', 'Máquina', 'Maquina']) || '').trim(),
    raw: row,
  };
}

function getCieloInstallments(row) {
  const candidates = ['Parcelas', 'Quantidade de parcelas', 'Quantidade total de parcelas', 'Qtd parcelas', 'Número de parcelas', 'Numero de parcelas', 'Plano'];
  for (const key of candidates) {
    const value = getValue(row, [key]);
    if (value) return String(value).trim();
  }

  const forma = String(getValue(row, ['Forma de pagamento']) || '');
  const match = forma.match(/(\d+)\s*x/i);
  return match ? match[1] : '';
}

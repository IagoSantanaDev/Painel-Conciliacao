import {
  createId,
  getValue,
  getValueContains,
  isSummaryRow,
  normalizeAuth,
  normalizeBrand,
  normalizeCardType,
  normalizeHeader,
  normalizePaymentMethod,
  parseMoneyBR,
} from '../utils/format.js';
import { parseCsvRows, parseWorkbookRows } from './fileReaders.js';

/** Deduplica registros hospitalares pelo autorizador + campos financeiros + bandeira/parcelas. */
function deduplicateHospitalRows(rows) {
  const seen = new Map();
  const result = [];
  for (const row of rows) {
    const key = [
      row.autorizador,
      row.valorCartao,
      row.valorDinheiro,
      row.valorFatura,
      row.bandeira,
      row.formaPagamento,
      row.parcelas,
      row.registro,
      row.lote,
      row.caixa,
    ].join('|');
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(row);
    }
  }
  return result;
}

export async function parseBiMv(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const rows = ext === 'csv' ? await parseCsvRows(file) : await parseWorkbookRows(file);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new Error('Não foi possível identificar o cabeçalho da planilha BI.');

  const objects = rowsToObjects(rows, headerIndex);
  const warnings = [];
  const hospitalRows = [];
  let ignoredRows = headerIndex;

  objects.forEach((row, index) => {
    if (isSummaryRow(row)) { ignoredRows++; return; }
    const payment = mapBiRow(row, index);
    if (!payment) { ignoredRows++; return; }
    hospitalRows.push(payment);
  });

  const deduplicated = deduplicateHospitalRows(hospitalRows);

  return { rows: deduplicated, warnings, ignoredRows, source: 'BI_MV' };
}

function findHeaderRow(rows) {
  return rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    const hasFinancialBase = headers.some(c => c.includes('valor fatura'))
      && (headers.some(c => c.includes('valor cartao')) || headers.some(c => c.includes('valor dinheiro')));
    const hasIdentity = headers.some(c => c.includes('lote') || c.includes('numero registro') || c.includes('data pagamento'));
    return hasFinancialBase && hasIdentity;
  });
}

function rowsToObjects(rows, headerIndex) {
  const header = rows[headerIndex].map(cell => String(cell ?? '').trim());
  return rows.slice(headerIndex + 1).map(row => {
    const obj = {};
    header.forEach((key, index) => {
      if (key) obj[key] = row[index] ?? '';
    });
    return obj;
  });
}

function mapBiRow(row, index) {
  const valorCartao = parseMoneyBR(getValue(row, ['Valor Cartão', 'Valor Cartao']));
  const valorDinheiro = parseMoneyBR(getValue(row, ['Valor Dinheiro']));
  const valorFatura = parseMoneyBR(getValue(row, ['Valor Fatura']));
  const registro = String(getValue(row, ['Número Registro', 'Numero Registro']) || '').trim();
  if (!registro && valorCartao === 0 && valorDinheiro === 0 && valorFatura === 0) return null;

  const formaRaw = getValue(row, ['Débito/ Crédito', 'Débito/Crédito', 'Debito/ Credito', 'Forma de pagamento']);
  const bandeira = getValue(row, ['Bandeira']);

  return {
    idInterno: createId('bi', index),
    origem: 'BI_MV',
    dataPagamento: String(getValue(row, ['Data Pagamento']) || '').trim(),
    horaPagamento: '',
    registro,
    caixa: String(getValue(row, ['Caixa']) || '').trim(),
    lote: String(getValue(row, ['Lote']) || '').trim(),
    contaFatura: String(getValue(row, ['Número Fatura RPS', 'Numero Fatura RPS', 'Número Fatura NFE', 'Numero Fatura NFE']) || '').trim(),
    autorizador: normalizeAuth(getValueContains(row, ['autorizador', 'autoriz'])),
    valorCartao,
    valorDinheiro,
    valorFatura,
    desconto: getValueContains(row, ['desconto']),
    formaPagamento: normalizePaymentMethod(formaRaw),
    tipoCartao: normalizeCardType(formaRaw),
    bandeira: normalizeBrand(bandeira),
    parcelas: String(getValue(row, ['Parcelas']) || '').trim(),
    observacoes: [],
    raw: row,
  };
}

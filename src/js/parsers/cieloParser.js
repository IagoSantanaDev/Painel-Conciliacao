import {
  createId,
  getValue,
  normalizeAuth,
  normalizeBrand,
  normalizePaymentMethod,
  parseMoneyBR,
} from '../utils/format.js';
import { parseCsvObjects } from './fileReaders.js';

export async function parseCielo(file) {
  const { rows, errors } = await parseCsvObjects(file);
  const warnings = errors.map(error => `Cielo CSV: ${error.message || 'aviso de leitura'}`);
  const sales = rows.map((row, index) => mapCieloRow(row, index)).filter(Boolean);
  if (!sales.some(sale => sale.autorizador)) throw new Error('O CSV Cielo não possui coluna de autorização reconhecida.');
  return { rows: sales, warnings };
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
    raw: row,
  };
}

function getCieloInstallments(row) {
  const candidates = ['Parcelas', 'Quantidade de parcelas', 'Qtd parcelas', 'Número de parcelas', 'Numero de parcelas', 'Plano'];
  for (const key of candidates) {
    const value = getValue(row, [key]);
    if (value) return String(value).trim();
  }

  const forma = String(getValue(row, ['Forma de pagamento']) || '');
  const match = forma.match(/(\d+)\s*x/i);
  return match ? match[1] : '';
}

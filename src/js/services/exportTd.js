import {
  EVENTO_PARTICULAR,
  SHEET_NAME,
  SHEET_ORDER,
  isCieloOnly,
  isCorrigido,
  isCardPayment,
  isCashPayment,
  isDivergente,
  isPendente,
  withCieloFallback,
} from './paymentPredicates.js';
import { sanitizeXlsxCellValue } from '../utils/sanitize.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CURRENCY_FORMAT = '"R$" #,##0.00';
const FORMA_ESPECIE = 'ESPÉCIE';

const LAYOUTS = {
  TD: {
    columns: [
      'Data pag/RPS', 'Data banco', 'Aten/Registro', 'Conta/Fatura',
      'Valor Fatura', 'Valor Banco', 'Evento', 'Forma de Pagamento',
      'Parcela', 'Conta de Crédito', 'Observação', 'Autorizador',
      'Número máquina POS',
    ],
    currencyColumns: ['Valor Fatura', 'Valor Banco'],
  },
  TASY_CIELO: {
    columns: [
      'Data RPS', 'Data Banco', 'Atend/Registro', 'Conta/Fatura',
      'Valor Fatura', 'Valor Banco', 'Evento', 'Forma de pagamento',
      'Parcela', 'Conta crédito', 'Observação', 'Código autorizador',
      'Número máquina POS',
    ],
    currencyColumns: ['Valor Fatura', 'Valor Banco'],
  },
};

export const TD_COLUMNS = LAYOUTS.TD.columns;
export const TASY_CIELO_COLUMNS = LAYOUTS.TASY_CIELO.columns;

export function exportTd(dadosFinal, options = {}) {
  if (!dadosFinal.length) {
    throw new Error('Não há dados processados para exportar.');
  }

  const useTasyCieloLayout = options.source === 'PDF_TASY' || dadosFinal.some(row => row.origem === 'PDF_TASY');
  const layoutKey = useTasyCieloLayout ? 'TASY_CIELO' : 'TD';
  const layout = LAYOUTS[layoutKey];
  const buildRows = useTasyCieloLayout ? buildTasyCieloRows : buildTdRows;
  const filename = useTasyCieloLayout ? 'exportacao_Tasy_Cielo.xlsx' : 'exportacao_TD.xlsx';
  const sheetGroups = buildSheetGroups(dadosFinal);
  const wb = window.XLSX.utils.book_new();
  let totalRows = 0;

  sheetGroups.forEach(group => {
    const rows = buildRows(group.rows);
    totalRows += rows.length;
    appendWorksheet(wb, group.name, rows, layout);
  });

  if (totalRows === 0) {
    throw new Error('Nenhuma linha TD foi gerada. Verifique se existem valores de cartão ou dinheiro nos registros processados.');
  }

  downloadWorkbook(wb, filename);

  return { filename, rowCount: totalRows, sheetCount: sheetGroups.length, columns: layout.columns };
}

export function classifyExportSheet(row) {
  if (isCorrigido(row)) return SHEET_NAME.CONCILIADOS;
  if (isCieloOnly(row)) return SHEET_NAME.NAO_ENCONTRADO;
  const hasAuthDup = (row.status || []).includes('Auth duplicado');
  if (hasAuthDup) return SHEET_NAME.DIVERGENTES;
  if (isCardPayment(row) || row.valorCielo > 0) return SHEET_NAME.CARTAO;
  if (isCashPayment(row)) return SHEET_NAME.DINHEIRO;
  if (isDivergente(row)) return SHEET_NAME.DIVERGENTES;
  if (isPendente(row)) return SHEET_NAME.PENDENTES;
  return SHEET_NAME.PENDENTES;
}

export function buildSheetGroups(dadosFinal) {
  const groups = new Map();

  dadosFinal.forEach(row => {
    const sheetName = classifyExportSheet(row);
    if (!groups.has(sheetName)) {
      groups.set(sheetName, []);
    }
    groups.get(sheetName).push(row);
  });

  return SHEET_ORDER
    .filter(name => groups.has(name))
    .map(name => ({ name, rows: groups.get(name) }));
}

function appendWorksheet(wb, sheetName, rows, layout) {
  const ws = window.XLSX.utils.json_to_sheet(rows, { header: layout.columns });
  ws['!cols'] = layout.columns.map(column => ({ wch: Math.max(14, column.length + 2) }));
  applyCurrencyFormat(ws, layout);
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function applyCurrencyFormat(ws, layout) {
  if (!ws['!ref']) return;
  const range = window.XLSX.utils.decode_range(ws['!ref']);
  const currencySet = new Set(layout.currencyColumns);

  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++) {
    if (!currencySet.has(layout.columns[columnIndex])) continue;

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
      const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = ws[address];
      if (!cell || cell.v === '' || cell.v === null || cell.v === undefined) continue;
      cell.t = 'n';
      cell.z = CURRENCY_FORMAT;
    }
  }
}

function buildObservacao(observacoes) {
  if (!Array.isArray(observacoes) || !observacoes.length) return '';
  return observacoes.join('; ');
}

const COLUMN_FIELD_MAP = [
  'data', 'dataBanco', 'registro', 'contaFatura',
  'valorFatura', 'valorBanco', 'evento', 'formaPagamento',
  'parcela', 'contaCredito', 'observacao', 'autorizador', 'numeroMaquinaPos',
];

function createExportRow(layout, fields) {
  const cols = LAYOUTS[layout].columns;
  const obs = fields.observacao !== undefined
    ? fields.observacao
    : buildObservacao(fields.observacoes);

  return Object.fromEntries(
    cols.map((col, i) => {
      const rawValue = i === 10 ? obs : (fields[COLUMN_FIELD_MAP[i]] ?? '');
      return [col, sanitizeXlsxCellValue(rawValue)];
    })
  );
}

function buildPaymentRows(dadosFinal, layout, cardValueSource = r => r.valorCartao || 0) {
  const out = [];

  dadosFinal.forEach(row => {
    const r = withCieloFallback(row);
    const numeroMaquinaPos = r.numeroMaquina || '';

    if (r.valorCartao > 0 || r.valorCielo > 0) {
      out.push(createExportRow(layout, {
        data: r.dataPagamento || r.dataVenda || '',
        dataBanco: '',
        registro: r.registro || '',
        contaFatura: r.contaFatura || '',
        valorFatura: r.valorFatura || 0,
        valorBanco: cardValueSource(r),
        evento: EVENTO_PARTICULAR,
        formaPagamento: r.formaPagamento || '',
        parcela: r.parcelas || '',
        contaCredito: '',
        observacao: '',
        autorizador: r.autorizador || '',
        numeroMaquinaPos,
      }));
    }

    if (r.valorDinheiro > 0) {
      out.push(createExportRow(layout, {
        data: r.dataPagamento || '',
        dataBanco: r.dataPagamento || '',
        registro: r.registro || '',
        contaFatura: r.contaFatura || '',
        valorFatura: r.valorFatura || 0,
        valorBanco: r.valorDinheiro || 0,
        evento: EVENTO_PARTICULAR,
        formaPagamento: FORMA_ESPECIE,
        parcela: '',
        contaCredito: '',
        observacao: '',
        autorizador: '',
        numeroMaquinaPos: '',
      }));
    }
  });

  return out;
}

function buildTasyCieloRows(dadosFinal) {
  return buildPaymentRows(dadosFinal, 'TASY_CIELO', r => r.valorBruto || r.valorCielo || r.valorCartao || 0);
}

function buildTdRows(dadosFinal) {
  return buildPaymentRows(dadosFinal, 'TD', r => r.valorCartao > 0 ? r.valorCartao : r.valorCielo || 0);
}

function downloadWorkbook(wb, filename) {
  const options = { bookType: 'xlsx', compression: true };

  try {
    if (typeof window.XLSX.writeFileXLSX === 'function') {
      window.XLSX.writeFileXLSX(wb, filename, options);
      return;
    }

    window.XLSX.writeFile(wb, filename, options);
  } catch (error) {
    downloadWorkbookWithBlob(wb, filename, options);
  }
}

function downloadWorkbookWithBlob(wb, filename, options) {
  const workbookArray = window.XLSX.write(wb, { ...options, type: 'array' });
  const blob = new Blob([workbookArray], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

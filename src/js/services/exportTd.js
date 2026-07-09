import {
  EVENTO_PARTICULAR,
  SHEET_NAME,
  SHEET_ORDER,
  STATUS_LABEL,
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
const DATE_FORMAT = 'dd/mm/yyyy';
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
    dateColumns: ['Data pag/RPS', 'Data banco'],
  },
  TASY_CIELO: {
    columns: [
      'Data RPS', 'Data Banco', 'Atend/Registro', 'Conta/Fatura',
      'Valor Fatura', 'Valor Banco', 'Evento', 'Forma de pagamento',
      'Parcela', 'Conta crédito', 'Observação', 'Código autorizador',
      'Número máquina POS',
    ],
    currencyColumns: ['Valor Fatura', 'Valor Banco'],
    dateColumns: ['Data RPS', 'Data Banco'],
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
  // Espelha a hierarquia dos filtros do painel (FILTERS em paymentPredicates.js).
  // O painel é fonte da verdade: cada aba do export deve conter EXATAMENTE as
  // rows que o filtro correspondente do painel devolveria, sem reclassificá-las.
  // Excessões documentadas pelo usuário:
  //   - Cielo-only SEMPRE vai pra Não encontrado (mesmo se for cartão/dinheiro).
  //   - Corrigidos ou Conciliados com Auth Duplicado PODEM ficar em Conciliados.
  //   - Sem autorizador sempre vai pra Divergentes.

  // Cielo-only sempre vai pra Não encontrado, mesmo se for cartão/dinheiro.
  if (isCieloOnly(row)) return SHEET_NAME.NAO_ENCONTRADO;

  // Conciliados: corrigido manual OU conciliado — pode ter Auth Duplicado
  // (o usuário disse que a aba Conciliados da planilha deve incluir corrigidos
  // ou conciliados com auth duplicado, sem mandar pra Divergentes).
  if (isCorrigido(row)) return SHEET_NAME.CONCILIADOS;
  if (row.statusLabel === STATUS_LABEL.CONCILIADO) return SHEET_NAME.CONCILIADOS;

  // Divergentes: predicate exato do painel + Sem autorizador.
  // (Auth Duplicado sem corrigido/conciliado cai aqui via isDivergente.)
  if (isDivergente(row)) return SHEET_NAME.DIVERGENTES;
  if ((row.status || []).includes('Sem autorizador')) return SHEET_NAME.DIVERGENTES;

  // Cartão: predicate do painel (valorCartao>0 OU tipo crédito/débito) mais
  // valorCielo>0 (pós-reconciliação). SEM checar isDivergente antes — o painel
  // é fonte da verdade.
  if (isCardPayment(row) || row.valorCielo > 0) return SHEET_NAME.CARTAO;

  // Dinheiro: predicate exato. Mesma lógica de não reclassificar.
  if (isCashPayment(row)) return SHEET_NAME.DINHEIRO;

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

  // Conciliados é a única aba sempre presente — quem marca corrigido alimenta ela.
  // Se ainda não houver linhas corrigidas, geramos ela vazia com header.
  if (!groups.has(SHEET_NAME.CONCILIADOS)) {
    groups.set(SHEET_NAME.CONCILIADOS, []);
  }

  return SHEET_ORDER
    .filter(name => groups.has(name))
    .map(name => ({ name, rows: groups.get(name) }));
}

function appendWorksheet(wb, sheetName, rows, layout) {
  const ws = window.XLSX.utils.json_to_sheet(rows, { header: layout.columns });
  ws['!cols'] = layout.columns.map(column => ({ wch: Math.max(14, column.length + 2) }));
  ensureNumericValueColumns(ws, layout);
  applyDateFormat(ws, layout);
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// Garante que as colunas financeiras (Valor Fatura, Valor Banco) sejam numéricas
// no Excel (t='n'), sem aplicar nenhum formato específico — o Excel renderiza
// como formato "Geral", mostrando o número como veio (ex: 350, 700.02).
function ensureNumericValueColumns(ws, layout) {
  if (!ws['!ref']) return;
  const range = window.XLSX.utils.decode_range(ws['!ref']);
  const valueSet = new Set(layout.currencyColumns);

  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++) {
    if (!valueSet.has(layout.columns[columnIndex])) continue;

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
      const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = ws[address];
      if (!cell || cell.v === '' || cell.v === null || cell.v === undefined) continue;
      cell.t = 'n';
      // Sem cell.z — Excel renderiza como "Geral".
    }
  }
}

function applyDateFormat(ws, layout) {
  if (!ws['!ref']) return;
  const range = window.XLSX.utils.decode_range(ws['!ref']);
  const dateSet = new Set(layout.dateColumns);
  const dateColumnsIdx = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    if (dateSet.has(layout.columns[c])) dateColumnsIdx.push(c);
  }
  if (!dateColumnsIdx.length) return;

  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
    for (const columnIndex of dateColumnsIdx) {
      const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = ws[address];
      if (!cell || cell.v === '' || cell.v === null || cell.v === undefined) continue;
      const serial = parseDateBRToSerial(cell.v);
      if (serial === null) continue;
      cell.v = serial;
      cell.t = 'n';
      cell.z = DATE_FORMAT;
    }
  }
}

function parseDateBRToSerial(value) {
  const str = String(value);
  if (str === '' || str === null || str === undefined) return null;
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let [, a, b, yyyy] = match;
  // Tenta BR (dd/mm/yyyy) primeiro; se o 'mês' for > 12, tenta US (mm/dd/yyyy).
  // É o caso de planilhas BI/MV antigas com células em formato m/d/yy.
  const tries = [
    { day: a, month: b },                 // BR
    { day: b, month: a },                 // US fallback
  ];
  for (const { day, month } of tries) {
    const dayPad = day.padStart(2, '0');
    const monthPad = month.padStart(2, '0');
    let yyyyFull = yyyy;
    if (yyyyFull.length === 2) yyyyFull = (Number(yyyyFull) <= 69 ? '20' : '19') + yyyyFull;
    const dayNum = Number(dayPad), monthNum = Number(monthPad), yearNum = Number(yyyyFull);
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum > 0) {
      const utc = Date.UTC(yearNum, monthNum - 1, dayNum);
      const excelEpoch = Date.UTC(1899, 11, 30);
      return (utc - excelEpoch) / 86400000;
    }
  }
  return null;
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
        dataBanco: r.dataPagamento || r.dataVenda || '',
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
        dataBanco: '',
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

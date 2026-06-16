import { isOkRow } from './reconciliation.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CURRENCY_COLUMNS = new Set(['Valor Fatura', 'Valor Banco']);
const CURRENCY_FORMAT = '"R$" #,##0.00';

export const TD_COLUMNS = [
  'Data pag/RPS',
  'Data banco',
  'Aten/Registro',
  'Conta/Fatura',
  'Valor Fatura',
  'Valor Banco',
  'Evento',
  'Forma de Pagamento',
  'Parcela',
  'Conta de Crédito',
  'Observação',
  'Autorizador',
  'Número máquina POS',
];

export const TASY_CIELO_COLUMNS = [
  'Data RPS',
  'Data Banco',
  'Atend/Registro',
  'Conta/Fatura',
  'Valor Fatura',
  'Valor Banco',
  'Evento',
  'Forma de pagamento',
  'Parcela',
  'Conta crédito',
  'Observação',
  'Código autorizador',
  'Número máquina POS',
];

export function exportTd(dadosFinal, options = {}) {
  if (!dadosFinal.length) {
    throw new Error('Não há dados processados para exportar.');
  }

  const useTasyCieloLayout = options.source === 'PDF_TASY' || dadosFinal.some(row => row.origem === 'PDF_TASY');
  const columns = useTasyCieloLayout ? TASY_CIELO_COLUMNS : TD_COLUMNS;
  const buildRows = useTasyCieloLayout ? buildTasyCieloRows : buildTdRows;
  const filename = useTasyCieloLayout ? 'exportacao_Tasy_Cielo.xlsx' : 'exportacao_TD.xlsx';
  const sheetGroups = buildSheetGroups(dadosFinal);
  const wb = window.XLSX.utils.book_new();
  let totalRows = 0;

  sheetGroups.forEach(group => {
    const rows = buildRows(group.rows);
    totalRows += rows.length;
    appendWorksheet(wb, group.name, rows, columns);
  });

  if (totalRows === 0) {
    throw new Error('Nenhuma linha TD foi gerada. Verifique se existem valores de cartão ou dinheiro nos registros processados.');
  }

  downloadWorkbook(wb, filename);

  return { filename, rowCount: totalRows, sheetCount: sheetGroups.length, columns };
}

function buildSheetGroups(dadosFinal) {
  return [
    { name: 'Conciliados', rows: dadosFinal.filter(isOkRow) },
    { name: 'Divergentes', rows: dadosFinal.filter(row => row.statusLabel === 'Divergente') },
    { name: 'Não encontrado', rows: dadosFinal.filter(row => row.statusLabel === 'Não encontrado' || hasStatusContaining(row, 'Não encontrado')) },
    { name: 'Pendentes', rows: dadosFinal.filter(row => row.statusLabel === 'Pendente') },
    { name: 'Dinheiro', rows: dadosFinal.filter(row => row.valorDinheiro > 0) },
  ];
}

function hasStatusContaining(row, text) {
  return Array.isArray(row.status) && row.status.some(status => String(status).includes(text));
}

function appendWorksheet(wb, sheetName, rows, columns) {
  const ws = window.XLSX.utils.json_to_sheet(rows, { header: columns });
  ws['!cols'] = columns.map(column => ({ wch: Math.max(14, column.length + 2) }));
  applyCurrencyFormat(ws, columns);
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function applyCurrencyFormat(ws, columns) {
  if (!ws['!ref']) return;
  const range = window.XLSX.utils.decode_range(ws['!ref']);

  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++) {
    if (!CURRENCY_COLUMNS.has(columns[columnIndex])) continue;

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
      const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = ws[address];
      if (!cell || cell.v === '' || cell.v === null || cell.v === undefined) continue;
      cell.t = 'n';
      cell.z = CURRENCY_FORMAT;
    }
  }
}

function buildTdRows(dadosFinal) {
  const dadosTD = [];

  dadosFinal.forEach(row => {
    const numeroMaquinaPos = row.numeroMaquina || row.cielo?.numeroMaquina || '';

    if (row.valorCartao > 0) {
      dadosTD.push(createTdRow({
        dataPagRps: row.dataPagamento || row.cielo?.dataVenda || '',
        dataBanco: row.cielo?.dataPrevistaPagamento || row.dataPagamento || row.cielo?.dataVenda || '',
        atenRegistro: row.registro || '',
        contaFatura: row.contaFatura || '',
        valorFatura: row.valorFatura || 0,
        valorBanco: row.valorCartao || 0,
        evento: 'Particular',
        formaPagamento: row.formaPagamento || '',
        parcela: row.parcelas || '',
        contaCredito: '',
        observacao: '',
        autorizador: row.autorizador || '',
        numeroMaquinaPos,
      }));
    }

    if (row.valorDinheiro > 0) {
      dadosTD.push(createTdRow({
        dataPagRps: row.dataPagamento || '',
        dataBanco: row.dataPagamento || '',
        atenRegistro: row.registro || '',
        contaFatura: row.contaFatura || '',
        valorFatura: row.valorFatura || 0,
        valorBanco: row.valorDinheiro || 0,
        evento: 'Particular',
        formaPagamento: 'ESPÉCIE',
        parcela: '',
        contaCredito: '',
        observacao: '',
        autorizador: '',
        numeroMaquinaPos: '',
      }));
    }
  });

  return dadosTD;
}

function buildTasyCieloRows(dadosFinal) {
  const dadosTD = [];

  dadosFinal.forEach(row => {
    const numeroMaquinaPos = row.numeroMaquina || row.cielo?.numeroMaquina || '';

    if (row.valorCartao > 0 || row.valorCielo > 0) {
      dadosTD.push(createTasyCieloRow({
        dataRps: row.dataPagamento || row.cielo?.dataVenda || '',
        dataBanco: row.cielo?.dataPrevistaPagamento || '',
        atendRegistro: row.registro || '',
        contaFatura: row.contaFatura || '',
        valorFatura: row.valorFatura || 0,
        valorBanco: row.cielo?.valorBruto || row.valorCielo || row.valorCartao || 0,
        evento: 'Particular',
        formaPagamento: row.formaPagamento || row.cielo?.formaPagamento || '',
        parcela: row.parcelas || row.cielo?.parcelas || '',
        contaCredito: '',
        observacao: '',
        codigoAutorizador: row.autorizador || row.cielo?.autorizador || '',
        numeroMaquinaPos,
      }));
    }

    if (row.valorDinheiro > 0) {
      dadosTD.push(createTasyCieloRow({
        dataRps: row.dataPagamento || '',
        dataBanco: row.dataPagamento || '',
        atendRegistro: row.registro || '',
        contaFatura: row.contaFatura || '',
        valorFatura: row.valorFatura || 0,
        valorBanco: row.valorDinheiro || 0,
        evento: 'Particular',
        formaPagamento: 'ESPÉCIE',
        parcela: '',
        contaCredito: '',
        observacao: '',
        codigoAutorizador: '',
        numeroMaquinaPos: '',
      }));
    }
  });

  return dadosTD;
}

function createTasyCieloRow({
  dataRps,
  dataBanco,
  atendRegistro,
  contaFatura,
  valorFatura,
  valorBanco,
  evento,
  formaPagamento,
  parcela,
  contaCredito,
  observacao,
  codigoAutorizador,
  numeroMaquinaPos,
}) {
  return {
    'Data RPS': dataRps,
    'Data Banco': dataBanco,
    'Atend/Registro': atendRegistro,
    'Conta/Fatura': contaFatura,
    'Valor Fatura': valorFatura,
    'Valor Banco': valorBanco,
    'Evento': evento,
    'Forma de pagamento': formaPagamento,
    'Parcela': parcela,
    'Conta crédito': contaCredito,
    'Observação': observacao,
    'Código autorizador': codigoAutorizador,
    'Número máquina POS': numeroMaquinaPos,
  };
}

function createTdRow({
  dataPagRps,
  dataBanco,
  atenRegistro,
  contaFatura,
  valorFatura,
  valorBanco,
  evento,
  formaPagamento,
  parcela,
  contaCredito,
  observacao,
  autorizador,
  numeroMaquinaPos,
}) {
  return {
    'Data pag/RPS': dataPagRps,
    'Data banco': dataBanco,
    'Aten/Registro': atenRegistro,
    'Conta/Fatura': contaFatura,
    'Valor Fatura': valorFatura,
    'Valor Banco': valorBanco,
    'Evento': evento,
    'Forma de Pagamento': formaPagamento,
    'Parcela': parcela,
    'Conta de Crédito': contaCredito,
    'Observação': observacao,
    'Autorizador': autorizador,
    'Número máquina POS': numeroMaquinaPos,
  };
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
  URL.revokeObjectURL(url);
}

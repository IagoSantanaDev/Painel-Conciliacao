import { isOkRow } from './reconciliation.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  const dadosTD = useTasyCieloLayout ? buildTasyCieloRows(dadosFinal) : buildTdRows(dadosFinal);
  if (!dadosTD.length) {
    throw new Error('Nenhuma linha TD foi gerada. Verifique se existem valores de cartão ou dinheiro nos registros processados.');
  }

  const filename = useTasyCieloLayout ? 'exportacao_Tasy_Cielo.xlsx' : 'exportacao_TD.xlsx';
  const sheetName = useTasyCieloLayout ? 'Tasy Cielo' : 'TD';
  const ws = window.XLSX.utils.json_to_sheet(dadosTD, { header: columns });
  ws['!cols'] = columns.map(column => ({ wch: Math.max(14, column.length + 2) }));

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
  downloadWorkbook(wb, filename);

  return { filename, rowCount: dadosTD.length, columns };
}

function buildTdRows(dadosFinal) {
  const dadosTD = [];

  dadosFinal.forEach(row => {
    const observacaoBase = [...(row.observacoes || [])];
    if (row.desconto && String(row.desconto) !== '0' && !isOkRow(row)) {
      observacaoBase.push(`Desconto identificado: ${row.desconto}`);
    }
    const observacao = observacaoBase.join(' | ');

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
        observacao,
        autorizador: row.autorizador || '',
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
        observacao,
        autorizador: '',
      }));
    }
  });

  return dadosTD;
}

function buildTasyCieloRows(dadosFinal) {
  const dadosTD = [];

  dadosFinal.forEach(row => {
    if (row.valorCartao > 0 || row.valorCielo > 0) {
      dadosTD.push(createTasyCieloRow({
        dataRps: row.dataPagamento || row.cielo?.dataVenda || '',
        dataBanco: '',
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
        numeroMaquinaPos: isMissingInSystem(row) ? (row.cielo?.numeroMaquina || '') : '',
      }));
    }

    if (row.valorDinheiro > 0) {
      dadosTD.push(createTasyCieloRow({
        dataRps: row.dataPagamento || '',
        dataBanco: '',
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

function isMissingInSystem(row) {
  return row.status?.includes('Não encontrado no sistema');
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

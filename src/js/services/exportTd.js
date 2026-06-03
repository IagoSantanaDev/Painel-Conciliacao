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

export function exportTd(dadosFinal) {
  if (!dadosFinal.length) {
    throw new Error('Não há dados processados para exportar.');
  }

  const dadosTD = buildTdRows(dadosFinal);
  if (!dadosTD.length) {
    throw new Error('Nenhuma linha TD foi gerada. Verifique se existem valores de cartão ou dinheiro nos registros processados.');
  }

  const filename = 'exportacao_TD.xlsx';
  const ws = window.XLSX.utils.json_to_sheet(dadosTD, { header: TD_COLUMNS });
  ws['!cols'] = TD_COLUMNS.map(column => ({ wch: Math.max(14, column.length + 2) }));

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'TD');
  downloadWorkbook(wb, filename);

  return { filename, rowCount: dadosTD.length, columns: TD_COLUMNS };
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

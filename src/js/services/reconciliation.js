export function reconcileRows(hospitalRows, cieloRows) {
  const cieloIndex = buildCieloIndex(cieloRows);
  const reconciledRows = hospitalRows.map(row => reconcileOne(row, cieloIndex));
  const matchedCieloIds = new Set(reconciledRows.map(row => row.cielo?.idInterno).filter(Boolean));
  const unmatchedCieloRows = cieloRows
    .filter(sale => !matchedCieloIds.has(sale.idInterno))
    .map(sale => reconcileOne(createCieloOnlyRow(sale), cieloIndex));

  return [...reconciledRows, ...unmatchedCieloRows];
}

export function reconcileOne(row, cieloIndex) {
  const result = {
    ...row,
    status: [],
    statusLabel: '',
    cielo: row.cielo || null,
    valorCielo: row.valorCielo || 0,
    diferenca: row.diferenca || 0,
    observacoes: [...(row.observacoes || [])],
  };

  if (result.origem === 'CIELO_SEM_SISTEMA') {
    return reconcileCieloOnly(result);
  }

  if (result.valorCartao <= 0 && result.valorDinheiro <= 0 && hasFinancialReference(result)) {
    result.status.push('Sem valor de pagamento');
  }

  if (result.valorCartao > 0) {
    if (!result.autorizador) {
      result.status.push('Sem autorizador');
    } else {
      const { sale, ambiguous, candidates } = pickCieloSale(result, cieloIndex);
      if (ambiguous && !sale) {
        result.status.push('Pendente revisão');
        result.observacoes.push(`Autorizador duplicado na Cielo com ${candidates.length} venda(s) candidata(s); selecione a venda correta antes de exportar.`);
      } else if (!sale) {
        result.status.push('Não encontrado na Cielo');
      } else {
        result.cielo = sale;
        result.valorCielo = sale.valorBruto || 0;
        result.diferenca = Number(((result.valorCartao || 0) - result.valorCielo).toFixed(2));
        result.parcelas = result.parcelas || sale.parcelas || '';
        result.bandeira = result.bandeira || sale.bandeira || '';
        result.formaPagamento = result.formaPagamento || sale.formaPagamento || '';

        if (ambiguous) {
          result.status.push('Pendente revisão');
          result.observacoes.push('Autorizador duplicado na Cielo; revisar venda usada para conciliação.');
        }

        if (Math.abs(result.diferenca) > 0.01) result.status.push('Divergência valor cartão');
        else result.status.push('Conciliado');
        if (!result.parcelas) result.observacoes.push('Parcelas não informadas');
      }
    }
  }

  if (result.valorDinheiro > 0) {
    if (result.valorCartao > 0) {
      result.status.push('Pagamento misto');
      if (result.valorFatura > 0 && Math.abs((result.valorCartao + result.valorDinheiro) - result.valorFatura) > 0.01) {
        result.status.push('Dinheiro Diferença');
      }
    } else if (Math.abs(result.valorDinheiro - result.valorFatura) > 0.01) {
      result.status.push('Dinheiro Diferença');
    } else {
      result.status.push('Dinheiro OK');
    }
  }

  if (!result.status.length) result.status.push('Conciliado');
  result.status = [...new Set(result.status)];
  result.statusLabel = getStatusLabel(result.status);
  return result;
}

export function buildCieloIndex(cieloRows) {
  const map = new Map();
  for (const sale of cieloRows) {
    if (!sale.autorizador) continue;
    if (!map.has(sale.autorizador)) map.set(sale.autorizador, []);
    map.get(sale.autorizador).push(sale);
  }
  return map;
}

export function isOkRow(row) {
  return ['Conciliado', 'Dinheiro', 'Pagamento misto'].includes(row.statusLabel)
    && !row.status.some(s => s.includes('Divergência') || s.includes('Diferença') || s.includes('Pendente') || s.includes('Não encontrado') || s.includes('Sem autorizador') || s.includes('Sem valor'));
}

function createCieloOnlyRow(sale) {
  return {
    idInterno: `cielo-only-${sale.idInterno}`,
    origem: 'CIELO_SEM_SISTEMA',
    dataPagamento: sale.dataVenda || '',
    horaPagamento: sale.horaVenda || '',
    registro: '',
    caixa: '',
    lote: '',
    contaFatura: '',
    autorizador: sale.autorizador || '',
    valorCartao: sale.valorBruto || 0,
    valorDinheiro: 0,
    valorFatura: 0,
    desconto: '',
    formaPagamento: sale.formaPagamento || '',
    tipoCartao: sale.formaPagamento || '',
    bandeira: sale.bandeira || '',
    parcelas: sale.parcelas || '',
    observacoes: ['Venda Cielo não encontrada no sistema'],
    cielo: sale,
    valorCielo: sale.valorBruto || 0,
    diferenca: Number((0 - (sale.valorBruto || 0)).toFixed(2)),
    raw: sale.raw,
  };
}

function reconcileCieloOnly(result) {
  const sale = result.cielo || null;
  result.valorCielo = sale?.valorBruto || result.valorCielo || result.valorCartao || 0;
  result.diferenca = Number((0 - result.valorCielo).toFixed(2));
  result.status.push('Não encontrado no sistema');
  if (!result.observacoes.includes('Venda Cielo não encontrada no sistema')) {
    result.observacoes.push('Venda Cielo não encontrada no sistema');
  }
  result.status = [...new Set(result.status)];
  result.statusLabel = getStatusLabel(result.status);
  return result;
}

function hasFinancialReference(row) {
  return (row.valorFatura || 0) > 0
    || Boolean(row.registro)
    || Boolean(row.contaFatura)
    || Boolean(row.autorizador);
}

function pickCieloSale(hospitalRow, cieloIndex) {
  const matches = cieloIndex.get(hospitalRow.autorizador) || [];
  if (!matches.length) return { sale: null, ambiguous: false, candidates: [] };

  const exact = matches.filter(sale => Math.abs((hospitalRow.valorCartao || 0) - (sale.valorBruto || 0)) <= 0.01);
  if (exact.length === 1) return { sale: exact[0], ambiguous: false, candidates: exact };
  if (matches.length === 1) return { sale: matches[0], ambiguous: false, candidates: matches };

  return { sale: null, ambiguous: true, candidates: exact.length ? exact : matches };
}

function getStatusLabel(status) {
  if (status.some(s => s.includes('Divergência') || s.includes('Diferença'))) return 'Divergente';
  if (status.includes('Não encontrado na Cielo') || status.includes('Não encontrado no sistema')) return 'Não encontrado';
  if (status.includes('Sem autorizador') || status.includes('Sem valor de pagamento') || status.includes('Pendente revisão')) return 'Pendente';
  if (status.includes('Dinheiro OK')) return 'Dinheiro';
  if (status.includes('Pagamento misto')) return 'Pagamento misto';
  return 'Conciliado';
}

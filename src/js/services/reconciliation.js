export function reconcileRows(hospitalRows, cieloRows) {
  const cieloIndex = buildCieloIndex(cieloRows);
  return hospitalRows.map(row => reconcileOne(row, cieloIndex));
}

export function reconcileOne(row, cieloIndex) {
  const result = {
    ...row,
    status: [],
    statusLabel: '',
    cielo: null,
    valorCielo: 0,
    diferenca: 0,
    observacoes: [...(row.observacoes || [])],
  };

  if (result.valorCartao > 0) {
    if (!result.autorizador) {
      result.status.push('Sem autorizador');
    } else {
      const { sale, ambiguous } = pickCieloSale(result, cieloIndex);
      if (!sale) {
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
    && !row.status.some(s => s.includes('Divergência') || s.includes('Diferença') || s.includes('Pendente') || s.includes('Não encontrado') || s.includes('Sem autorizador'));
}

function pickCieloSale(hospitalRow, cieloIndex) {
  const matches = cieloIndex.get(hospitalRow.autorizador) || [];
  if (!matches.length) return { sale: null, ambiguous: false };

  const exact = matches.filter(sale => Math.abs((hospitalRow.valorCartao || 0) - (sale.valorBruto || 0)) <= 0.01);
  if (exact.length === 1) return { sale: exact[0], ambiguous: false };
  if (exact.length > 1) return { sale: exact[0], ambiguous: true };
  return { sale: matches[0], ambiguous: matches.length > 1 };
}

function getStatusLabel(status) {
  if (status.some(s => s.includes('Divergência') || s.includes('Diferença'))) return 'Divergente';
  if (status.includes('Não encontrado na Cielo')) return 'Não encontrado';
  if (status.includes('Sem autorizador') || status.includes('Pendente revisão')) return 'Pendente';
  if (status.includes('Dinheiro OK')) return 'Dinheiro';
  if (status.includes('Pagamento misto')) return 'Pagamento misto';
  return 'Conciliado';
}

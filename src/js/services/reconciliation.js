import { STATUS_LABEL, hasBlockingStatus, containsBlockingKeyword, isCorrigido } from './paymentPredicates.js';
import { normalizeAuth, parseMoneyBR } from '../utils/format.js';

const EPSILON = 0.01;

function _buildCieloIndex(cieloRows, extraFilter) {
  return cieloRows.reduce((map, sale) => {
    if (!sale.autorizador) return map;
    const key = normalizeAuth(sale.autorizador);
    if (!key) return map;
    if (extraFilter && !extraFilter(sale)) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(sale);
    return map;
  }, new Map());
}

export function buildCieloIndexWithDedup(cieloRows) {
  const seen = new Set();
  let duplicatesRemoved = 0;
  const index = _buildCieloIndex(cieloRows, sale => {
    const key = normalizeAuth(sale.autorizador);
    if (!key) return false;
    const dedupeKey = `${key}|${sale.valorBruto ?? ''}|${sale.dataVenda ?? ''}|${sale.nsu ?? ''}`;
    if (seen.has(dedupeKey)) {
      duplicatesRemoved++;
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
  return { index, duplicatesRemoved };
}

export function reconcileRows(hospitalRows, cieloIndex, duplicateAutorizadores) {

  const matchedCieloIds = new Set();
  const dupes = duplicateAutorizadores instanceof Set ? duplicateAutorizadores : new Set();

  const hospitalResults = hospitalRows.map(row => {
    const result = reconcileOne(row, cieloIndex, matchedCieloIds, dupes);
    if (result.cielo?.idInterno) {

      matchedCieloIds.add(result.cielo.idInterno);
    }

    if (result.ambiguousCandidates?.length) {
      for (const c of result.ambiguousCandidates) {
        matchedCieloIds.add(c.idInterno);
      }
    }
    return result;
  });

  const allCieloRows = [];
  for (const sales of cieloIndex.values()) {
    allCieloRows.push(...sales);
  }

  const cieloOnlyRows = allCieloRows
    .filter(sale => !matchedCieloIds.has(sale.idInterno))
    .map(sale => ({
      idInterno: sale.idInterno,
      registro: '—',
      caixa: '—',
      lote: '—',
      autorizador: sale.autorizador || '—',
      valorCartao: 0,
      valorDinheiro: 0,
      valorFatura: 0,
      desconto: 0,
      bandeira: sale.bandeira || '',
      formaPagamento: sale.formaPagamento || '',
      parcelas: sale.parcelas || '',
      numeroMaquina: sale.numeroMaquina || '',
      status: ['Não encontrado no sistema'],
      statusLabel: STATUS_LABEL.NAO_ENCONTRADO_CIELO,
      cielo: sale,
      valorCielo: sale.valorBruto || 0,
      diferenca: 0,
      observacoes: [],
      cieloOnly: true,
      dataVenda: sale.dataVenda || '',
      horaVenda: sale.horaVenda || '',
      nsu: sale.nsu || '',
      corrigido: false,
    }));

  return [...hospitalResults, ...cieloOnlyRows];
}

export function reconcileOne(row, cieloIndex, matchedCieloIds = new Set(), duplicateAutorizadores) {
  const result = {
    ...row,
    status: [],
    statusLabel: '',
    cielo: null,
    valorCielo: 0,
    diferenca: 0,
    numeroMaquina: row.numeroMaquina || '',
    observacoes: row.observacoes ? [...row.observacoes] : [],

    ambiguousCandidates: [],
  };

  if (result.valorCartao <= 0 && result.valorDinheiro <= 0 && hasFinancialReference(result)) {
    result.status.push('Sem valor de pagamento');
  }

  if (result.valorCartao > 0) {
    if (!result.autorizador) {
      result.status.push('Sem autorizador');
    } else {
      const allowReuse = duplicateAutorizadores instanceof Set
        && result.autorizador
        && duplicateAutorizadores.has(result.autorizador);
      const { sale, ambiguous, candidates } = pickCieloSale(result, cieloIndex, matchedCieloIds, allowReuse);
      if (ambiguous && !sale) {
        result.status.push('Pendente revisão');

        result.ambiguousCandidates = candidates || [];
        if (allowReuse) result.status.push('Auth duplicado');
      } else if (!sale) {
        result.status.push('Não encontrado na Cielo');
        if (allowReuse) result.status.push('Auth duplicado');
      } else {
        if (allowReuse) result.status.push('Auth duplicado');
        result.cielo = sale;
        result.valorCielo = sale.valorBruto || 0;
        result.diferenca = Number(((result.valorCartao || 0) - result.valorCielo).toFixed(2));
        result.parcelas = result.parcelas || sale.parcelas || '';
        result.bandeira = result.bandeira || sale.bandeira || '';
        result.formaPagamento = result.formaPagamento || sale.formaPagamento || '';
        result.numeroMaquina = result.numeroMaquina || sale.numeroMaquina || '';

        if (Math.abs(result.diferenca) > EPSILON) result.status.push('Divergência valor cartão');
        else result.status.push('Conciliado');
      }
    }
  }

  if (result.valorDinheiro > 0) {
    if (result.valorCartao <= 0 && !result.formaPagamento) result.formaPagamento = 'ESPÉCIE';
    if (result.valorCartao > 0) {
      result.status.push('Pagamento misto');
      if (result.valorFatura > 0 && Math.abs((result.valorCartao + result.valorDinheiro) - result.valorFatura) > EPSILON) {

        const descontoNum = parseMoneyBR(result.desconto);
        const correctedDiff = Math.abs(
          result.valorCartao + result.valorDinheiro + descontoNum - (result.valorFatura || 0)
        );
        if (correctedDiff > EPSILON) {
          result.status.push('Dinheiro Diferença');
        }
      }
    } else if (Math.abs(result.valorDinheiro - result.valorFatura) > EPSILON) {

      const descontoNum = parseMoneyBR(result.desconto);

      const discountDiff = Math.abs(result.valorDinheiro + descontoNum - (result.valorFatura || 0));
      if (discountDiff > EPSILON) {
        result.status.push('Dinheiro Diferença');
      }
      result.status.push('Dinheiro');
    } else {
      result.status.push('Dinheiro');
    }
  }

  if (!result.status.length) result.status.push(STATUS_LABEL.CONCILIADO);
  result.status = _dedupeStatus(result.status);
  if (result.desconto) result.observacoes.push(result.desconto);
  result.observacoes = [...new Set(result.observacoes.filter(Boolean))];

  if (isCorrigido(row)) {
    const filtered = result.status.filter(s => !containsBlockingKeyword(s) && s !== 'À Conciliar');
    result.status = filtered.length ? [...filtered, STATUS_LABEL.CORRIGIDO] : [STATUS_LABEL.CORRIGIDO];
  } else if (result.valorDinheiro > 0 && !hasBlockingStatus(result)) {
    result.status.push('À Conciliar');
  }

  result.status = _dedupeStatus(result.status);
  result.statusLabel = getStatusLabel(result.status);
  return result;
}

function hasFinancialReference(row) {
  return (row.valorFatura || 0) > 0
    || Boolean(row.registro)
    || Boolean(row.contaFatura);
}

function pickCieloSale(hospitalRow, cieloIndex, matchedCieloIds = new Set(), allowReuse = false) {
  const authKey = normalizeAuth(hospitalRow.autorizador);
  const allMatches = cieloIndex.get(authKey);
  if (!allMatches?.length) return { sale: null, ambiguous: false, candidates: [] };

  let exact = null;
  let exactCount = 0;
  const matches = [];
  const exactSales = [];
  const targetValue = hospitalRow.valorCartao || 0;

  for (const sale of allMatches) {
    if (!allowReuse && matchedCieloIds.has(sale.idInterno)) continue;
    matches.push(sale);

    const isExact = Math.abs(targetValue - (sale.valorBruto || 0)) <= EPSILON;
    if (isExact) {
      exact = sale;
      exactCount++;
      exactSales.push(sale);
    }
  }

  if (!matches.length) return { sale: null, ambiguous: false, candidates: [] };
  if (exactCount === 1) return { sale: exact, ambiguous: false, candidates: matches };
  if (matches.length === 1) return { sale: matches[0], ambiguous: false, candidates: matches };

  return { sale: null, ambiguous: true, candidates: exactCount > 0 ? exactSales : matches };
}

function getStatusLabel(status) {
  if (status.includes(STATUS_LABEL.CORRIGIDO)) return STATUS_LABEL.CORRIGIDO;
  if (status.some(s => s.includes('Divergência') || s.includes('Diferença'))) return STATUS_LABEL.DIVERGENTE;
  if (status.some(s => s.includes(STATUS_LABEL.NAO_ENCONTRADO))) return STATUS_LABEL.NAO_ENCONTRADO;
  if (status.includes('Sem autorizador') || status.includes('Sem valor de pagamento') || status.includes('Pendente revisão')) return STATUS_LABEL.PENDENTE;
  if (status.includes(STATUS_LABEL.DINHEIRO)) return STATUS_LABEL.DINHEIRO;
  if (status.includes(STATUS_LABEL.PAGAMENTO_MISTO)) return STATUS_LABEL.PAGAMENTO_MISTO;
  return STATUS_LABEL.CONCILIADO;
}

function _dedupeStatus(status) {
  return [...new Set(status)];
}

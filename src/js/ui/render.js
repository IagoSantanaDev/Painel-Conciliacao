import { escapeAttr, escapeHtml, formatMoney, normalizeText } from '../utils/format.js';
import { isOkRow } from '../services/reconciliation.js';

export function showAlert(el, type, message) {
  el.alertHost.className = 'alert';
  el.alertHost.textContent = '';
  if (!type || !message) return;
  el.alertHost.classList.add('show', type);
  el.alertHost.textContent = message;
}

export function setLoading(el, state, loading) {
  el.processBtn.disabled = loading;
  el.processBtn.textContent = loading ? 'Processando...' : 'Processar conciliação';
  if (el.heroStatus) {
    el.heroStatus.textContent = loading ? 'Processando arquivos' : (state.dadosFinal.length ? 'Conciliação processada' : 'Aguardando arquivos');
  }
}

export function renderUploadSummary(el) {
  const hospitalFiles = Array.from(el.hospitalFile.files || []);
  const cieloFiles = Array.from(el.cieloFile.files || []);

  el.hospitalFileName.textContent = summarizeFiles(hospitalFiles);
  el.cieloFileName.textContent = summarizeFiles(cieloFiles);
  el.hospitalDropZone.classList.toggle('has-file', hospitalFiles.length > 0);
  el.cieloDropZone.classList.toggle('has-file', cieloFiles.length > 0);
}

function summarizeFiles(files) {
  if (!files.length) return 'Nenhum arquivo selecionado';

  if (files.length === 1) {
    const ext = files[0].name.split('.').pop().toLowerCase();
    const label = ext === 'pdf' ? 'PDF' : 'Planilha';
    return `${files[0].name} [${label}]`;
  }

  const counts = { pdf: 0, planilha: 0 };
  files.forEach(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') counts.pdf++;
    else counts.planilha++;
  });
  const parts = [];
  if (counts.planilha) parts.push(`${counts.planilha} planilha(s)`);
  if (counts.pdf) parts.push(`${counts.pdf} PDF(s)`);
  const firstNames = files.slice(0, 2).map(file => file.name).join(', ');
  const remaining = files.length > 2 ? ` +${files.length - 2}` : '';
  return `${files.length} arquivos (${parts.join(', ')}): ${firstNames}${remaining}`;
}

export function renderAll(el, state, onFilterChange) {
  const hasRows = state.dadosFinal.length > 0;
  el.metricsGrid.classList.toggle('hidden', !hasRows);
  el.toolbar.classList.toggle('hidden', !hasRows);
  el.emptyState.classList.toggle('hidden', hasRows);
  el.tableWrap.classList.toggle('hidden', !hasRows);
  el.exportBtn.disabled = !hasRows;
  el.exportBtn.title = hasRows ? 'Exporta os registros processados, incluindo linhas ainda pendentes para revisão.' : '';
  if (el.heroStatus) {
    el.heroStatus.textContent = hasRows ? 'Conciliação processada' : 'Aguardando arquivos';
  }
  renderUploadSummary(el);

  if (!hasRows) {
    el.tabelaBody.innerHTML = '';
    return;
  }

  renderMetrics(el, state);
  renderFilters(el, state, onFilterChange);
  renderControls(el, state);
  renderTabela(el, state);
}

function computeMetrics(rows) {
  return {
    total: rows.length,
    conciliados: rows.filter(isOkRow).length,
    divergentes: rows.filter(row => row.corrigido !== true && row.statusLabel === 'Divergente').length,
    naoEncontrado: rows.filter(row => row.corrigido !== true && (row.statusLabel === 'Não encontrado' || hasStatusContaining(row, 'Não encontrado'))).length,
    dinheiro: rows.filter(row => row.corrigido !== true && (row.statusLabel === 'Dinheiro' || row.statusLabel === 'Pagamento misto' || hasStatusContaining(row, 'À Conciliar'))).length,
    pendentes: rows.filter(row => row.corrigido !== true && row.statusLabel === 'Pendente').length,
    cartao: rows.filter(row => isOkRow(row) && (row.valorCartao > 0 || row._cieloOnly)).length,
    valorCartao: rows.reduce((sum, row) => sum + (row.valorCartao || 0), 0),
    valorDinheiro: rows.reduce((sum, row) => sum + (row.valorDinheiro || 0), 0),
    valorTotal: rows.reduce((sum, row) => sum + (row.valorCartao || 0) + (row.valorDinheiro || 0), 0),
  };
}

function renderMetrics(el, state) {
  const metrics = computeMetrics(state.dadosFinal);
  const cards = [
    ['Total registros', metrics.total, ''],
    ['Conciliados', metrics.conciliados, 'primary'],
    ['Cartão', metrics.cartao, ''],
    ['Dinheiro/Espécie', metrics.dinheiro, ''],
    ['Divergentes', metrics.divergentes, ''],
    ['Não encontrados', metrics.naoEncontrado, ''],
    ['Pendentes', metrics.pendentes, ''],
    ['Valor total cartão', formatMoney(metrics.valorCartao), 'primary'],
    ['Valor total dinheiro', formatMoney(metrics.valorDinheiro), ''],
    ['Valor total', formatMoney(metrics.valorTotal), ''],
  ];

  el.metricsGrid.innerHTML = cards
    .map(([label, value, cls]) => `<div class="metric ${cls}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
}

function renderFilters(el, state, onFilterChange) {
  const filters = [
    ['todos', 'Todos'],
    ['conciliado', 'Conciliados'],
    ['corrigido', 'Corrigidos'],
    ['cartao', 'Cartão'],
    ['credito', 'Crédito'],
    ['debito', 'Débito'],
    ['dinheiro', 'Dinheiro/Espécie'],
    ['divergente', 'Divergentes'],
    ['naoEncontrado', 'Não encontrados'],
    ['pendente', 'Pendentes'],
  ];

  el.filters.innerHTML = filters
    .map(([key, label]) => `<button class="filter-btn ${state.currentFilter === key ? 'active' : ''}" type="button" data-filter="${key}">${label}</button>`)
    .join('');

  el.filters.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      if (el.tableSearch) el.tableSearch.value = '';
      onFilterChange(button.dataset.filter);
    });
  });
}

function renderControls(el, state) {
  if (el.tableSearch) el.tableSearch.value = state.searchQuery || '';
}

function rowMatchesFilter(row, filter) {
  const isCorrectedMoney = row.corrigido === true && row.status?.some(s => s.includes('Dinheiro') || s.includes('Pagamento misto'));
  switch (filter) {
    case 'conciliado': return isOkRow(row) && !isCorrectedMoney;
    case 'divergente': return row.corrigido !== true && row.statusLabel === 'Divergente';
    case 'naoEncontrado': return row.statusLabel === 'Não encontrado' || hasStatusContaining(row, 'Não encontrado');
    case 'cartao': return isCardPayment(row);
    case 'credito': return isCardType(row, 'credito');
    case 'debito': return isCardType(row, 'debito');
    case 'dinheiro': return row.corrigido !== true && (row.statusLabel === 'Dinheiro' || row.statusLabel === 'Pagamento misto' || hasStatusContaining(row, 'À Conciliar'));
    case 'pendente': return row.corrigido !== true && row.statusLabel === 'Pendente';
    case 'corrigido': return row.corrigido === true;
    case 'todos': return !isCieloOnlyRow(row);
    default: return !isCieloOnlyRow(row);
  }
}

function isCieloOnlyRow(row) {
  return row._cieloOnly === true || row.status?.some(status => status === 'Não encontrado no sistema');
}

function isCardPayment(row) {
  return row.valorCartao > 0 || row._cieloOnly === true || isCardType(row, 'credito') || isCardType(row, 'debito');
}

function isCardType(row, type) {
  const haystack = normalizeText([
    row.tipoCartao,
    row.formaPagamento,
    row.bandeira,
    row.cielo?.formaPagamento,
  ].filter(Boolean).join(' '));
  return haystack.includes(type);
}

function rowMatchesSearch(row, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeText([
    row.registro,
    row.caixa,
    row.lote,
    row.autorizador,
    row.dataPagamento,
  ].filter(Boolean).join(' '));
  return haystack.includes(normalizedQuery);
}

function hasStatusContaining(row, text) {
  return Array.isArray(row.status) && row.status.some(status => String(status).includes(text));
}

function getDisplayPriority(row) {
  if (row.corrigido === true) return 1;
  if (isOkRow(row)) return 0;
  if (row.statusLabel === 'Dinheiro' || row.statusLabel === 'Pagamento misto' || hasStatusContaining(row, 'À Conciliar')) return 2;
  if (row.statusLabel === 'Divergente') return 3;
  if (row.statusLabel === 'Pendente') return 4;
  if (row.statusLabel === 'Não encontrado' || hasStatusContaining(row, 'Não encontrado')) return 5;
  return 6;
}

function renderTabela(el, state) {
  const hasSearch = Boolean(normalizeText(state.searchQuery));
  const rows = state.dadosFinal
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => hasSearch ? rowMatchesSearch(row, state.searchQuery) : rowMatchesFilter(row, state.currentFilter))
    .sort((a, b) => getDisplayPriority(a.row) - getDisplayPriority(b.row) || a.index - b.index);

  const total = state.dadosFinal.length;
  const naoEncontradoCount = state.dadosFinal.filter(row =>
    row.statusLabel === 'Não encontrado' || hasStatusContaining(row, 'Não encontrado')
  ).length;
  const suffix = !hasSearch && (state.currentFilter === 'todos' || !state.currentFilter) && naoEncontradoCount > 0
    ? ` (${naoEncontradoCount} não encontrado)`
    : '';
  el.resultCount.textContent = `${rows.length} de ${total} registro(s)${suffix}`;
  el.tabelaBody.innerHTML = rows.map(({ row, index }) => renderTableRow(row, index)).join('');
}

function renderTableRow(row, index) {
  let rowClass = '';
  if (row.corrigido) rowClass = 'row-corrigido';
  else if (row.statusLabel === 'Divergente' || row.statusLabel === 'Não encontrado' || row._cieloOnly) rowClass = 'row-error';
  else if (row.statusLabel === 'Pendente') rowClass = 'row-alert';

  return `<tr class="${rowClass}">
    <td class="td-conciliado">${renderConciliadoCell(row, index)}</td>
    <td>${cell(row, index, 'registro')}</td>
    <td>${cell(row, index, 'caixa')}</td>
    <td>${cell(row, index, 'lote')}</td>
    <td>${cell(row, index, 'autorizador')}</td>
    <td>${cell(row, index, 'valorCartao', 'money')}</td>
    <td>${cell(row, index, 'valorDinheiro', 'money')}</td>
    <td>${cell(row, index, 'valorFatura', 'money')}</td>
    <td>${cell(row, index, 'desconto')}</td>
    <td>${cell(row, index, 'formaPagamento')}</td>
    <td>${renderStatusCell(row, index)}</td>
  </tr>`;
}

function renderConciliadoCell(row, index) {
  if (!needsConciliarCheckbox(row)) return '<span class="conciliado-empty" aria-hidden="true"></span>';
  const checked = row.corrigido ? 'checked' : '';
  return `<input type="checkbox" class="conciliar-big" data-index="${index}" data-action="toggle-corrigido" ${checked} aria-label="Marcar linha como corrigida">`;
}

function renderStatusCell(row, index) {
  return `<div class="badges">${renderStatusBadges(row.status)}</div>`;
}

function needsConciliarCheckbox(row) {
  if (row.corrigido) return true;
  return ['Divergente', 'Não encontrado', 'Pendente', 'Dinheiro', 'Pagamento misto'].includes(row.statusLabel)
    || row._cieloOnly === true;
}

function cell(row, index, field, type = 'text') {
  const value = row[field] ?? '';
  if (row.corrigido) {
    return type === 'money' ? `<span class="value">${formatMoney(value)}</span>` : escapeHtml(value || '—');
  }
  if (!isOkRow(row)) {
    const displayValue = type === 'money' ? String(value).replace('.', ',') : value;
    return `<input class="edit" data-index="${index}" data-field="${field}" value="${escapeAttr(displayValue)}">`;
  }
  return type === 'money' ? `<span class="value">${formatMoney(value)}</span>` : escapeHtml(value || '—');
}

function renderStatusBadges(status) {
  return status.map(item => {
    let cls = 'neutral';
    if (item === 'Corrigido') cls = 'success';
    else if (item === 'À Conciliar') cls = 'warning';
    else if (item.includes('Dinheiro') && item.includes('Diferença')) cls = 'danger';
    else if (item.includes('Conciliado') || item.includes('Dinheiro')) cls = 'success';
    else if (item.includes('Divergência') || item.includes('Diferença') || item.includes('Não encontrado') || item.includes('Sem autorizador')) cls = 'danger';
    else if (item.includes('Pendente') || item.includes('Sem valor')) cls = 'warning';
    else if (item.includes('misto')) cls = 'info';
    return `<span class="badge ${cls}">${escapeHtml(item)}</span>`;
  }).join('');
}

import { escapeAttr, escapeHtml, formatMoney } from '../utils/format.js';
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
  el.processIcon.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span>' : '✓';
  if (el.heroStatus) {
    el.heroStatus.textContent = loading ? 'Processando arquivos' : (state.dadosFinal.length ? 'Conciliação processada' : 'Aguardando arquivos');
  }
}

export function renderUploadSummary(el) {
  const hospitalFile = el.hospitalFile.files[0];
  const cieloFile = el.cieloFile.files[0];
  const hospitalName = hospitalFile ? hospitalFile.name : 'Nenhum arquivo selecionado';
  const cieloName = cieloFile ? cieloFile.name : 'Nenhum arquivo selecionado';

  el.hospitalFileName.textContent = hospitalName;
  el.cieloFileName.textContent = cieloName;
  el.hospitalDropZone.classList.toggle('has-file', Boolean(hospitalFile));
  el.cieloDropZone.classList.toggle('has-file', Boolean(cieloFile));
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
  renderTabela(el, state);
}

function computeMetrics(rows) {
  return {
    total: rows.length,
    conciliados: rows.filter(isOkRow).length,
    divergentes: rows.filter(row => row.statusLabel === 'Divergente').length,
    naoEncontrados: rows.filter(row => row.statusLabel === 'Não encontrado').length,
    dinheiro: rows.filter(row => row.valorDinheiro > 0).length,
    pendentes: rows.filter(row => row.statusLabel === 'Pendente').length,
    valorCartao: rows.reduce((sum, row) => sum + (row.valorCartao || 0), 0),
  };
}

function renderMetrics(el, state) {
  const metrics = computeMetrics(state.dadosFinal);
  const cards = [
    ['Total registros', metrics.total, ''],
    ['Conciliados', metrics.conciliados, 'primary'],
    ['Divergentes', metrics.divergentes, ''],
    ['Não encontrados', metrics.naoEncontrados, ''],
    ['Dinheiro/Espécie', metrics.dinheiro, ''],
    ['Valor total cartão', formatMoney(metrics.valorCartao), 'primary'],
  ];

  el.metricsGrid.innerHTML = cards
    .map(([label, value, cls]) => `<div class="metric ${cls}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
}

function renderFilters(el, state, onFilterChange) {
  const filters = [
    ['todos', 'Todos'],
    ['conciliado', 'Conciliados'],
    ['divergente', 'Divergentes'],
    ['naoEncontrado', 'Não encontrados'],
    ['dinheiro', 'Dinheiro'],
    ['pendente', 'Pendentes'],
  ];

  el.filters.innerHTML = filters
    .map(([key, label]) => `<button class="filter-btn ${state.currentFilter === key ? 'active' : ''}" type="button" data-filter="${key}">${label}</button>`)
    .join('');

  el.filters.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => onFilterChange(button.dataset.filter));
  });
}

function rowMatchesFilter(row, filter) {
  switch (filter) {
    case 'conciliado': return isOkRow(row);
    case 'divergente': return row.statusLabel === 'Divergente';
    case 'naoEncontrado': return row.statusLabel === 'Não encontrado';
    case 'dinheiro': return row.valorDinheiro > 0;
    case 'pendente': return row.statusLabel === 'Pendente';
    default: return true;
  }
}

function renderTabela(el, state) {
  const rows = state.dadosFinal
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatchesFilter(row, state.currentFilter));

  el.resultCount.textContent = `${rows.length} de ${state.dadosFinal.length} registro(s)`;
  el.tabelaBody.innerHTML = rows.map(({ row, index }) => renderTableRow(row, index)).join('');
}

function renderTableRow(row, index) {
  const rowClass = row.statusLabel === 'Divergente' || row.statusLabel === 'Não encontrado'
    ? 'row-error'
    : row.statusLabel === 'Pendente' ? 'row-alert' : '';

  return `<tr class="${rowClass}">
    <td>${cell(row, index, 'registro')}</td>
    <td>${cell(row, index, 'caixa')}</td>
    <td>${cell(row, index, 'lote')}</td>
    <td>${cell(row, index, 'autorizador')}</td>
    <td>${cell(row, index, 'valorCartao', 'money')}</td>
    <td>${cell(row, index, 'valorDinheiro', 'money')}</td>
    <td>${cell(row, index, 'valorFatura', 'money')}</td>
    <td>${cell(row, index, 'desconto')}</td>
    <td><div class="badges">${renderStatusBadges(row.status)}</div></td>
  </tr>`;
}

function cell(row, index, field, type = 'text') {
  const value = row[field] ?? '';
  if (!isOkRow(row)) {
    const displayValue = type === 'money' ? String(value).replace('.', ',') : value;
    return `<input class="edit" data-index="${index}" data-field="${field}" value="${escapeAttr(displayValue)}">`;
  }
  return type === 'money' ? `<span class="value">${formatMoney(value)}</span>` : escapeHtml(value || '—');
}

function renderStatusBadges(status) {
  return status.map(item => {
    let cls = 'neutral';
    if (item.includes('Conciliado') || item.includes('Dinheiro OK')) cls = 'success';
    else if (item.includes('Divergência') || item.includes('Diferença') || item.includes('Não encontrado') || item.includes('Sem autorizador')) cls = 'danger';
    else if (item.includes('Pendente') || item.includes('Sem valor')) cls = 'warning';
    else if (item.includes('misto')) cls = 'info';
    return `<span class="badge ${cls}">${escapeHtml(item)}</span>`;
  }).join('');
}

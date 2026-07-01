import { escapeAttr, escapeHtml } from '../utils/sanitize.js';
import { normalizeText } from '../utils/string.js';
import { formatMoney } from '../utils/format.js';

import {
  FILTERS,
  STATUS_LABEL,
  isCardPayment,
  isCardType,
  isCashPayment,
  isCieloOnly,
  isCorrigido,
  isDivergente,
  isOkRow,
  isOkRowBridge,
  isPendente,
} from '../services/paymentPredicates.js';
import { getFileExt } from '../utils/fileExt.js';
import { chunkedAppend } from './chunkedRender.js';

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
  el.processBtn.setAttribute('aria-busy', String(loading));
  const resultsArea = document.getElementById('resultsArea');
  if (resultsArea) resultsArea.setAttribute('aria-busy', String(loading));
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
    const ext = getFileExt(files[0]);
    const label = ext === 'pdf' ? 'PDF' : 'Planilha';
    return `${escapeHtml(files[0].name)} [${label}]`;
  }

  const counts = { pdf: 0, planilha: 0 };
  files.forEach(f => {
    const ext = getFileExt(f);
    if (ext === 'pdf') counts.pdf++;
    else counts.planilha++;
  });
  const parts = [];
  if (counts.planilha) parts.push(`${counts.planilha} planilha(s)`);
  if (counts.pdf) parts.push(`${counts.pdf} PDF(s)`);
  const firstNames = files.slice(0, 2).map(file => escapeHtml(file.name)).join(', ');
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
  renderUploadSummary(el);

  if (!hasRows) {
    el.tabelaBody.replaceChildren();
    return;
  }

  renderMetrics(el, state);
  renderFilters(el, state, onFilterChange);
  renderControls(el, state);
  renderTabela(el, state);
}

export function getEffectiveRow(row, duplicateAutorizadores) {
  if (!row) return row;
  if (isCieloOnly(row)) return row;
  const dupes = duplicateAutorizadores instanceof Set ? duplicateAutorizadores : new Set();
  const isDupeAuth = row.autorizador && dupes.has(row.autorizador);
  if (!isDupeAuth) return row;
  const hasDupBadge = (row.status || []).includes('Auth duplicado');
  return {
    ...row,
    statusLabel: STATUS_LABEL.DIVERGENTE,
    status: hasDupBadge ? row.status : [...(row.status || []), 'Auth duplicado'],
    cieloOnly: false,
    _originalStatusLabel: row.statusLabel,
  };
}

export function computeMetrics(rows, duplicateAutorizadores = new Set()) {
  let total = 0, conciliados = 0, divergentes = 0, naoEncontrado = 0,
      dinheiro = 0, pendentes = 0, cartao = 0,
      valorCartao = 0, valorDinheiro = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const effectiveRow = getEffectiveRow(row, duplicateAutorizadores);
    total++;
    if (isOkRowBridge(effectiveRow)) conciliados++;
    if (isDivergente(effectiveRow)) divergentes++;
    if (isCieloOnly(effectiveRow)) naoEncontrado++;
    if (isPendente(effectiveRow)) pendentes++;

    if (isCashPayment(effectiveRow) && !isDivergente(effectiveRow)) dinheiro++;
    if (isCardPayment(effectiveRow)) cartao++;
    const vc = row.valorCartao || 0;
    const vd = row.valorDinheiro || 0;
    valorCartao += vc;
    valorDinheiro += vd;
  }

  return {
    total,
    conciliados,
    divergentes,
    naoEncontrado,
    dinheiro,
    pendentes,
    cartao,
    valorCartao,
    valorDinheiro,
    valorTotal: valorCartao + valorDinheiro,
  };
}

let _cachedMetrics = null;

export function invalidateMetricsCache() {
  _cachedMetrics = null;
}

export function renderMetrics(el, state) {
  const metrics = _cachedMetrics || (_cachedMetrics = computeMetrics(state.dadosFinal, state.duplicateAutorizadores));
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

  el.metricsGrid.replaceChildren();
  for (const [label, value, cls] of cards) {
    const div = document.createElement('div');
    div.className = `metric ${cls}`.trim();
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    div.append(span, strong);
    el.metricsGrid.append(div);
  }
}

const attachedFilters = new WeakSet();

function renderFilters(el, state, onFilterChange) {
  if (!attachedFilters.has(el.filters)) {
    attachedFilters.add(el.filters);
    el.filters.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      if (el.tableSearch) el.tableSearch.value = '';
      onFilterChange(btn.dataset.filter);
    });
  }

  el.filters.innerHTML = FILTERS
    .map(({ key, label }) => `<button class="filter-btn ${state.currentFilter === key ? 'active' : ''}" type="button" data-filter="${key}" aria-current="${state.currentFilter === key ? 'true' : 'false'}">${label}</button>`)
    .join('');
}

function renderControls(el, state) {
  if (el.tableSearch) el.tableSearch.value = state.searchQuery || '';
}

export function rowMatchesFilter(row, filter) {
  const found = FILTERS.find(f => f.key === filter);
  if (!found) return false;
  return found.predicate(row);
}

export function rowMatchesSearch(row, query) {
  if (!query) return true;
  const haystack = normalizeText([
    row.registro,
    row.caixa,
    row.lote,
    row.autorizador,
    row.dataPagamento,
  ].filter(Boolean).join(' '));
  return haystack.includes(query);
}

export function getDisplayPriority(row, dupes = new Set()) {
  if (row.autorizador && dupes.has(row.autorizador)) {
    if (row._originalStatusLabel === STATUS_LABEL.NAO_ENCONTRADO) return 999;
    return -1;
  }
  if (isCorrigido(row)) return 1;
  if (isOkRow(row)) return 0;
  if (isCashPayment(row)) return 2;
  if (row.statusLabel === STATUS_LABEL.DIVERGENTE) return 3;
  if (row.statusLabel === STATUS_LABEL.PENDENTE) return 4;

  if (row.statusLabel === STATUS_LABEL.NAO_ENCONTRADO) return 5;
  if (isCieloOnly(row)) return 6;
  return 7;
}

export function sortResultsByPriority(results, dupes) {
  const groupPriority = new Map();
  for (const r of results) {
    const auth = r.row.autorizador;
    if (!auth || !dupes.has(auth)) continue;
    const current = groupPriority.get(auth);
    if (current === undefined || r.priority < current) groupPriority.set(auth, r.priority);
  }

  return [...results].sort((a, b) => {
    const aAuth = a.row.autorizador;
    const bAuth = b.row.autorizador;
    const aGroupPrio = aAuth && groupPriority.has(aAuth) ? groupPriority.get(aAuth) : a.priority;
    const bGroupPrio = bAuth && groupPriority.has(bAuth) ? groupPriority.get(bAuth) : b.priority;
    if (aGroupPrio !== bGroupPrio) return aGroupPrio - bGroupPrio;
    const aIsDup = aAuth && dupes.has(aAuth);
    const bIsDup = bAuth && dupes.has(bAuth);
    if (aIsDup && bIsDup) {
      if (aAuth === bAuth) return a.originalIndex - b.originalIndex;
      return String(aAuth).localeCompare(String(bAuth));
    }
    return a.originalIndex - b.originalIndex;
  });
}

function renderTabela(el, state) {
  const hasSearch = Boolean(normalizeText(state.searchQuery));
  const query = hasSearch ? normalizeText(state.searchQuery) : null;
  const filter = state.currentFilter;
  const dupes = state.duplicateAutorizadores || new Set();

  const results = [];
  let naoEncontradoCount = 0;
  for (let i = 0; i < state.dadosFinal.length; i++) {
    const row = state.dadosFinal[i];
    if (isCieloOnly(row)) naoEncontradoCount++;

    const effectiveRow = getEffectiveRow(row, dupes);

    let matches;
    if (query !== null) {
      matches = rowMatchesSearch(effectiveRow, query);
    } else {
      const found = FILTERS.find(f => f.key === filter);
      matches = found ? found.predicate(effectiveRow) : false;
    }
    if (!matches) continue;

    results.push({ row: effectiveRow, originalIndex: i, priority: getDisplayPriority(effectiveRow, dupes) });
  }

  const sorted = sortResultsByPriority(results, dupes);

  const total = state.dadosFinal.length;
  const suffix = !hasSearch && (filter === 'todos' || !filter) && naoEncontradoCount > 0
    ? ` (${naoEncontradoCount} não encontrado)`
    : '';
  el.resultCount.textContent = `${results.length} de ${total} registro(s)${suffix}`;

  if (_currentRenderHandle) {
    _currentRenderHandle.cancel();
  }
  const rowStrings = sorted.map(({ originalIndex }) =>
    renderTableRow(state.dadosFinal[originalIndex], originalIndex, dupes)
  );
  el.tabelaBody.replaceChildren();
  _currentRenderHandle = chunkedAppend(el.tabelaBody, rowStrings);
}

let _currentRenderHandle = null;
let _renderStartTime = 0;

export function renderTableRow(row, index, duplicateAutorizadores) {
  const effectiveRow = getEffectiveRow(row, duplicateAutorizadores);
  let rowClass = '';
  if (isCorrigido(effectiveRow)) rowClass = 'row-corrigido';
  else if (effectiveRow.statusLabel === STATUS_LABEL.DIVERGENTE || effectiveRow.statusLabel === STATUS_LABEL.NAO_ENCONTRADO || isCieloOnly(effectiveRow)) rowClass = 'row-error';
  else if (effectiveRow.statusLabel === STATUS_LABEL.PENDENTE) rowClass = 'row-alert';

  return `<tr data-idx="${String(index)}" class="${rowClass}">
    <td class="td-conciliado">${renderConciliadoCell(effectiveRow, index)}</td>
    <td>${cell(effectiveRow, index, 'registro')}</td>
    <td>${cell(effectiveRow, index, 'caixa')}</td>
    <td>${cell(effectiveRow, index, 'lote')}</td>
    <td>${cell(effectiveRow, index, 'autorizador', 'text')}</td>
    <td>${cell(effectiveRow, index, 'valorCartao', 'money')}</td>
    <td>${cell(effectiveRow, index, 'valorDinheiro', 'money')}</td>
    <td>${cell(effectiveRow, index, 'valorFatura', 'money')}</td>
    <td>${cell(effectiveRow, index, 'desconto')}</td>
    <td>${cell(effectiveRow, index, 'parcelas')}</td>
    <td>${cell(effectiveRow, index, 'formaPagamento')}</td>
    <td>${renderStatusCell(effectiveRow, index)}</td>
  </tr>`;
}

function renderConciliadoCell(row, index) {
  if (!needsConciliarCheckbox(row)) return '<span class="conciliado-empty" aria-hidden="true"></span>';
  const checked = row.corrigido ? 'checked' : '';
  return `<input type="checkbox" class="conciliar-big" data-index="${String(index)}" data-action="toggle-corrigido" ${checked} aria-label="Marcar linha como corrigida">`;
}

function renderStatusCell(row, index) {
  return `<div class="badges">${renderStatusBadges(row.status, row)}</div>`;
}

const LABELS_REQUIRING_CHECKBOX = new Set([
  STATUS_LABEL.DIVERGENTE,
  STATUS_LABEL.NAO_ENCONTRADO,
  STATUS_LABEL.PENDENTE,
  STATUS_LABEL.DINHEIRO,
  STATUS_LABEL.PAGAMENTO_MISTO,
]);

const BADGE_CLASS_MAP = Object.freeze({
  [STATUS_LABEL.CORRIGIDO]: 'success',
  'À Conciliar': 'warning',
});

function getBadgeClass(item, row) {
  if (BADGE_CLASS_MAP[item] !== undefined) return BADGE_CLASS_MAP[item];
  if (item === 'Auth duplicado') return 'danger';
  if (item.includes('Dinheiro') && item.includes('Diferença')) return 'danger';
  if (item.includes('Conciliado') || item.includes('Dinheiro')) return 'success';
  if (item.includes('Divergência') || item.includes('Diferença') || item.includes(STATUS_LABEL.NAO_ENCONTRADO) || item.includes('Sem autorizador') || isCieloOnly(row)) return 'danger';
  if (item.includes('Pendente') || item.includes('Sem valor')) return 'warning';
  if (item.includes('misto')) return 'info';
  return 'neutral';
}

function needsConciliarCheckbox(row) {
  if (isCorrigido(row)) return true;
  return LABELS_REQUIRING_CHECKBOX.has(row.statusLabel);
}

function cell(row, index, field, type = 'text') {
  const value = row[field] ?? '';
  if (isCorrigido(row)) {
    return type === 'money'
      ? `<span class="value">${formatMoney(value)}</span>`
      : `${escapeHtml(value || '—')}`;
  }
  if (!isOkRow(row)) {
    const displayValue = type === 'money' ? Number(value).toFixed(2).replace('.', ',') : value;
    return `<input class="edit" data-index="${String(index)}" data-field="${escapeAttr(field)}" value="${escapeAttr(displayValue)}" inputmode="decimal" aria-label="${escapeAttr(field)}">`;
  }
  return type === 'money'
    ? `<span class="value">${formatMoney(value)}</span>`
    : `${escapeHtml(value || '—')}`;
}

export function updateSingleRow(el, row, index, duplicateAutorizadores) {
  const tr = el.tabelaBody.querySelector(`tr[data-idx="${index}"]`);
  if (!tr) return false;
  const template = document.createElement('template');
  template.innerHTML = renderTableRow(row, index, duplicateAutorizadores);
  tr.replaceWith(...template.content.childNodes);
  return true;
}

function renderStatusBadges(status, row) {
  return status.map(item => {
    const cls = getBadgeClass(item, row);
    return `<span class="badge ${cls}">${escapeHtml(item)}</span>`;
  }).join('');
}

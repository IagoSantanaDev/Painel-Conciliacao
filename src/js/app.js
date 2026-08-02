import { setupDropZone } from './ui/dropZone.js';
import { parseCieloFiles, parseHospitalFiles } from './services/parsePipeline.js';
import { buildCieloIndexWithDedup, reconcileOne, reconcileRows } from './services/reconciliation.js';
import { buildConsumedCieloIds, isOkRow } from './services/paymentPredicates.js';
import { resolveAtendimento } from './services/atendimentoResolver.js';
import { exportTd } from './services/exportTd.js';
import { normalizeAuth, parseMoneyBRStrict } from './utils/format.js';
import { normalizeText } from './utils/string.js';
import { validateFiles } from './utils/validateFiles.js';
import { HOSPITAL_EXTENSIONS, SPREADSHEET_EXTENSIONS } from './utils/fileExt.js';
import { deduplicateCrossSourceRows, findDuplicateAutorizadores } from './utils/dedupe.js';
import { getElements } from './ui/dom.js';
import { renderAll, renderUploadSummary, setLoading, showAlert, rowMatchesFilter, rowMatchesSearch, updateSingleRow, invalidateMetricsCache, renderMetrics, getEffectiveRow } from './ui/render.js';
import { createUndoStack } from './services/undoStack.js';

['dragover', 'drop'].forEach(ev =>
  window.addEventListener(ev, e => { e.preventDefault(); }, { passive: false })
);

const SEARCH_DEBOUNCE_MS = 150;

let _procGeneration = 0;

let _searchTimer;

const state = {
  hospitalRows: [],
  cieloRows: [],
  cieloIndex: null,
  dadosFinal: [],
  duplicateAutorizadores: new Set(),
  warnings: [],
  currentFilter: 'todos',
  searchQuery: '',
  lastSource: '',
  undoStack: [],
  redoStack: [],
};

const UNDO_HISTORY_LIMIT = 50;
const history = createUndoStack(UNDO_HISTORY_LIMIT);

const el = getElements();

el.processBtn.addEventListener('click', processar);
el.clearBtn.addEventListener('click', limparArquivos);
el.exportBtn.addEventListener('click', exportarTd);
el.tableSearch?.addEventListener('input', handleSearchChange);
el.tableSearch?.addEventListener('search', handleSearchChange);
el.tableSearch?.addEventListener('keyup', handleSearchKeyup);
el.hospitalFile.addEventListener('change', () => renderUploadSummary(el));
el.cieloFile.addEventListener('change', () => renderUploadSummary(el));
setupDropZone({ dropZone: el.hospitalDropZone, input: el.hospitalFile, acceptedExtensions: HOSPITAL_EXTENSIONS, invalidMessage: 'Use CSV, XLSX, XLS, XLSM, XLSB, ODS ou PDF no arquivo hospitalar.', el, showAlert });
setupDropZone({ dropZone: el.cieloDropZone, input: el.cieloFile, acceptedExtensions: SPREADSHEET_EXTENSIONS, invalidMessage: 'Use CSV, XLSX, XLS, XLSM, XLSB ou ODS no arquivo Cielo.', el, showAlert });
el.tabelaBody.addEventListener('change', event => {
  const checkbox = event.target.closest('input.conciliar-big');
  if (checkbox) {
    toggleCorrigido(Number(checkbox.dataset.index), checkbox.checked);
    return;
  }
  const input = event.target.closest('input.edit');
  if (!input) return;
  atualizar(Number(input.dataset.index), input.dataset.field, input.value);
});

window.addEventListener('keydown', event => {
  const isCtrl = event.ctrlKey || event.metaKey;
  if (!isCtrl) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    redo();
  }
});

renderAll(el, state, handleFilterChange);
renderUploadSummary(el);

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  validateRuntimeDependencies();
} else {
  document.addEventListener('DOMContentLoaded', validateRuntimeDependencies);
}

window.addEventListener('beforeunload', limparArquivos);

async function processar() {
  if (el.processBtn.disabled) return;
  const hospitalFiles = Array.from(el.hospitalFile.files || []);
  const cieloFiles = Array.from(el.cieloFile.files || []);
  if (!hospitalFiles.length || !cieloFiles.length) {
    showAlert(el, 'error', 'Importe ao menos um arquivo hospitalar e um arquivo Cielo antes de processar.');
    return;
  }

  try {
    validateFiles(hospitalFiles, HOSPITAL_EXTENSIONS, 'Arquivo hospitalar');
    validateFiles(cieloFiles, SPREADSHEET_EXTENSIONS, 'Arquivo Cielo');
  } catch (err) {
    showAlert(el, 'error', err.message);
    return;
  }

  setLoading(el, state, true);
  showAlert(el, '', '');

  clearTimeout(_searchTimer);

  const myGen = ++_procGeneration;

  try {
    const [hospitalResult, cieloResult] = await Promise.all([
      parseHospitalFiles(hospitalFiles),
      parseCieloFiles(cieloFiles),
    ]);

    if (myGen !== _procGeneration) return;

    const resolvedHospital = resolveAtendimento(hospitalResult.rows, hospitalResult.atendimentoIndex);
    state.hospitalRows = deduplicateCrossSourceRows(resolvedHospital.rows);
    state.cieloRows = cieloResult.rows;
    state.cieloIndex = buildCieloIndexWithDedup(state.cieloRows).index;
    state.duplicateAutorizadores = findDuplicateAutorizadores(state.hospitalRows);
    state.dadosFinal = reconcileRows(state.hospitalRows, state.cieloIndex, state.duplicateAutorizadores);
    state.warnings = [...(hospitalResult.warnings || []), ...(resolvedHospital.warnings || []), ...(cieloResult.warnings || [])];
    if (hospitalResult.ignoredRows) state.warnings.push(`${hospitalResult.ignoredRows} linha(s) ignorada(s) no BI/MV.`);
    if (hospitalResult.ignoredLines) state.warnings.push(`${hospitalResult.ignoredLines} linha(s) ignorada(s) no PDF Tasy.`);
    if (cieloResult.ignoredRows) state.warnings.push(`${cieloResult.ignoredRows} linha(s) de preâmbulo ignorada(s) no relatório Cielo.`);
    state.lastSource = hospitalResult.source;
    state.undoStack = [];
    state.redoStack = [];
    history.clear();
    state.currentFilter = 'todos';
    invalidateMetricsCache();
    renderAll(el, state, handleFilterChange);
    const pendingRows = state.dadosFinal.filter(row => {
      const effectiveRow = getEffectiveRow(row, state.duplicateAutorizadores);
      return !isOkRow(effectiveRow);
    }).length;
    const exportMessage = pendingRows > 0
      ? `${pendingRows} linha(s) com pendência para revisão. Exportação TD liberada.`
      : 'Exportação TD liberada.';

    const failedFilesCount = state.warnings.filter(w => w.startsWith('Falha ao processar')).length;
    const failurePrefix = failedFilesCount > 0
      ? `${failedFilesCount} arquivo(s) falhou(aram) e foi(ram) ignorado(s). `
      : '';
    showAlert(el, 'success', `${failurePrefix}${state.dadosFinal.length} linha(s) processada(s) a partir de ${hospitalFiles.length + cieloFiles.length} arquivo(s). ${exportMessage}`);
  } catch (error) {

    console.error(error.message || error);
    showAlert(el, 'error', error.message || 'Não foi possível processar os arquivos.');
  } finally {
    setLoading(el, state, false);
  }
}

function atualizar(index, campo, valor) {
  const previous = state.dadosFinal[index];
  if (!previous) return;
  const row = { ...previous, corrigido: previous.corrigido === true };
  if (['valorCartao', 'valorDinheiro', 'valorFatura'].includes(campo)) {
    const parsed = parseMoneyBRStrict(valor);
    if (!parsed.valid) {
      showAlert(el, 'error', 'Informe um valor monetário válido, como 123,45 ou 1.234,56.');
      return;
    }
    row[campo] = parsed.value;
  }
  else if (campo === 'autorizador') row[campo] = normalizeAuth(valor);
  else row[campo] = valor;

  if (campo === 'atendimento' && String(valor || '').trim()) {
    row.atendimentoResolvido = true;
    row.pendenciaAtendimento = false;
    row.atendimentoManual = true;
  }

  reconciliarEAtualizar(index, row);
}

function toggleCorrigido(index, checked) {
  const previous = state.dadosFinal[index];
  if (!previous) return;
  const row = { ...previous, corrigido: checked === true };
  reconciliarEAtualizar(index, row);
}

function reconciliarEAtualizar(index, rowOverride) {
  const before = state.dadosFinal[index];
  const beforeAuth = before.autorizador;
  const simulatedFinal = state.dadosFinal.slice();
  simulatedFinal[index] = rowOverride;
  const dupesWithEdit = findDuplicateAutorizadores(simulatedFinal);

  const matchedCieloIds = buildConsumedCieloIds(state.dadosFinal, index);
  const updatedRow = reconcileOne(rowOverride, state.cieloIndex, matchedCieloIds, dupesWithEdit);

  pushHistory(index, before, updatedRow);
  state.duplicateAutorizadores = dupesWithEdit;
  state.dadosFinal[index] = updatedRow;

  let otherUpdates = 0;
  if (beforeAuth) {
    for (let i = 0; i < state.dadosFinal.length; i++) {
      if (i === index) continue;
      const other = state.dadosFinal[i];
      if (!other.autorizador || other.autorizador !== beforeAuth) continue;
      const otherMatchedIds = buildConsumedCieloIds(state.dadosFinal, i);
      const otherReconciled = reconcileOne(other, state.cieloIndex, otherMatchedIds, dupesWithEdit);
      if (otherReconciled.status?.join('|') !== other.status?.join('|') ||
          otherReconciled.statusLabel !== other.statusLabel) {
        pushHistory(i, other, otherReconciled);
        state.dadosFinal[i] = otherReconciled;
        otherUpdates++;
      }
    }
  }

  invalidateMetricsCache();

  if (otherUpdates > 0) {
    renderAll(el, state, handleFilterChange);
    return;
  }
  updateRowOrRebuild(index, updatedRow);
}

function pushHistory(index, before, after) {
  history.push(before, after, index);
}

function undo() {
  const op = history.undo();
  if (!op) return;
  state.dadosFinal[op.index] = op.before;
  state.duplicateAutorizadores = findDuplicateAutorizadores(state.dadosFinal);
  invalidateMetricsCache();
  renderAll(el, state, handleFilterChange);
}

function redo() {
  const op = history.redo();
  if (!op) return;
  state.dadosFinal[op.index] = op.after;
  state.duplicateAutorizadores = findDuplicateAutorizadores(state.dadosFinal);
  invalidateMetricsCache();
  renderAll(el, state, handleFilterChange);
}

function updateRowOrRebuild(index, updatedRow) {
  state.dadosFinal[index] = updatedRow;
  invalidateMetricsCache();

  const matchesFilter = rowMatchesFilter(updatedRow, state.currentFilter);
  const matchesSearch = !state.searchQuery || rowMatchesSearch(updatedRow, state.searchQuery);
  const stillVisible = matchesFilter && matchesSearch;

  if (stillVisible) {
    const updated = updateSingleRow(el, updatedRow, index, state.duplicateAutorizadores);
    if (updated) {
      renderMetrics(el, state);
      return;
    }
  }

  renderAll(el, state, handleFilterChange);
}

function limparArquivos() {
  clearTimeout(_searchTimer);
  el.hospitalFile.value = '';
  el.cieloFile.value = '';
  state.hospitalRows = [];
  state.cieloRows = [];
  state.cieloIndex = null;
  state.dadosFinal = [];
  state.duplicateAutorizadores = new Set();
  state.warnings = [];
  state.lastSource = '';
  state.currentFilter = 'todos';
  state.searchQuery = '';
  state.undoStack = [];
  state.redoStack = [];
  history.clear();
  if (el.tableSearch) el.tableSearch.value = '';

  invalidateMetricsCache();
  showAlert(el, '', '');
  renderAll(el, state, handleFilterChange);
  renderUploadSummary(el);
}

function exportarTd() {
  try {
    const result = exportTd(state.dadosFinal, { source: state.lastSource });
    showAlert(el, 'success', `${result.filename} gerado com ${result.rowCount} linha(s) distribuída(s) em ${result.sheetCount} aba(s).`);
  } catch (error) {
    console.error(error.message || error);
    showAlert(el, 'error', error.message || 'Não foi possível gerar o arquivo .xlsx.');
  }
}

function validateRuntimeDependencies() {
  const missing = [];
  if (!window.Papa) missing.push('PapaParse');
  if (!window.XLSX) missing.push('SheetJS/XLSX');

  if (!missing.length) return;

  el.processBtn.disabled = true;
  el.exportBtn.disabled = true;
  showAlert(el, 'error', `Bibliotecas locais não carregadas: ${missing.join(', ')}. Verifique os arquivos em src/vendor.`);
}

function handleFilterChange(filter) {
  state.currentFilter = filter;
  state.searchQuery = '';
  if (el.tableSearch) el.tableSearch.value = '';
  renderAll(el, state, handleFilterChange);
  focusFilterButton(filter);
}

function handleSearchChange(event) {
  applySearchValue(event.target.value);
}

function handleSearchKeyup(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  applySearchValue(event.target.value);
}

function applySearchValue(value) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    state.searchQuery = normalizeText(String(value || '')).trim();
    renderAll(el, state, handleFilterChange);
  }, SEARCH_DEBOUNCE_MS);
}

function focusFilterButton(filter) {
  const button = el.filters.querySelector(`[data-filter="${filter}"]`);
  if (!button) return;

  try {
    button.focus({ preventScroll: true });
  } catch {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    button.focus();
    window.scrollTo(scrollX, scrollY);
  }
}

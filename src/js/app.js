import { parseBiMv } from './parsers/biMvParser.js';
import { parseCielo } from './parsers/cieloParser.js';
import { parseTasyPdf } from './parsers/pdfTasyParser.js';
import { buildCieloIndex, deduplicateCieloCrossFile, isOkRow, reconcileOne, reconcileRows } from './services/reconciliation.js';
import { exportTd } from './services/exportTd.js';
import { normalizeAuth, parseMoneyBRStrict } from './utils/format.js';
import { getElements } from './ui/dom.js';
import { renderAll, renderUploadSummary, setLoading, showAlert } from './ui/render.js';

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('src/vendor/pdf.worker.min.js', document.baseURI).toString();
}

const SPREADSHEET_EXTENSIONS = ['csv', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods'];
const HOSPITAL_EXTENSIONS = [...SPREADSHEET_EXTENSIONS, 'pdf'];

/** Deduplica linhas de múltiplas fontes (PDF + planilha) pela chave canônica de conciliação.
 *  Garante que a mesma transação vinda de arquivos diferentes não gere duplicatas. */
function deduplicateCrossSource(rows) {
  const seen = new Map();
  const result = [];
  for (const row of rows) {
    const key = [
      row.autorizador,
      row.valorCartao,
      row.valorDinheiro,
      row.valorFatura,
      row.bandeira,
      row.formaPagamento,
      row.parcelas,
      row.lote,
      row.caixa,
    ].join('|');
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(row);
    }
  }
  return result;
}

const state = {
  hospitalRows: [],
  cieloRows: [],
  dadosFinal: [],
  warnings: [],
  currentFilter: 'todos',
  lastSource: '',
  parsedInfo: null,
};

const el = getElements();

el.processBtn.addEventListener('click', processar);
el.clearBtn.addEventListener('click', limparArquivos);
el.exportBtn.addEventListener('click', exportarTd);
el.hospitalFile.addEventListener('change', () => renderUploadSummary(el));
el.cieloFile.addEventListener('change', () => renderUploadSummary(el));
setupDropZone(el.hospitalDropZone, el.hospitalFile, HOSPITAL_EXTENSIONS, 'Use CSV, XLSX, XLS, XLSM, XLSB, ODS ou PDF no arquivo hospitalar.');
setupDropZone(el.cieloDropZone, el.cieloFile, SPREADSHEET_EXTENSIONS, 'Use CSV, XLSX, XLS, XLSM, XLSB ou ODS no arquivo Cielo.');
el.tabelaBody.addEventListener('change', event => {
  const input = event.target.closest('input.edit');
  if (!input) return;
  atualizar(Number(input.dataset.index), input.dataset.field, input.value);
});

renderAll(el, state, handleFilterChange);
renderUploadSummary(el);
validateRuntimeDependencies();

async function processar() {
  const hospitalFiles = Array.from(el.hospitalFile.files || []);
  const cieloFiles = Array.from(el.cieloFile.files || []);
  if (!hospitalFiles.length || !cieloFiles.length) {
    showAlert(el, 'error', 'Importe ao menos um arquivo hospitalar e um arquivo Cielo antes de processar.');
    return;
  }

  setLoading(el, state, true);
  showAlert(el, '', '');

  try {
    const [hospitalResult, cieloResult] = await Promise.all([
      parseHospitalFiles(hospitalFiles),
      parseCieloFiles(cieloFiles),
    ]);

    state.hospitalRows = deduplicateCrossSource(hospitalResult.rows);
    state.cieloRows = deduplicateCieloCrossFile(cieloResult.rows);
    state.dadosFinal = reconcileRows(state.hospitalRows, state.cieloRows);
    state.warnings = [...(hospitalResult.warnings || []), ...(cieloResult.warnings || [])];
    if (hospitalResult.ignoredRows) state.warnings.push(`${hospitalResult.ignoredRows} linha(s) ignorada(s) no BI/MV.`);
    if (hospitalResult.ignoredLines) state.warnings.push(`${hospitalResult.ignoredLines} linha(s) ignorada(s) no PDF Tasy.`);
    if (cieloResult.ignoredRows) state.warnings.push(`${cieloResult.ignoredRows} linha(s) de preâmbulo ignorada(s) no relatório Cielo.`);
    state.lastSource = hospitalResult.source;
    state.parsedInfo = hospitalResult;
    state.currentFilter = 'todos';

    renderAll(el, state, handleFilterChange);
    const pendingRows = state.dadosFinal.filter(row => !isOkRow(row)).length;
    const exportMessage = pendingRows > 0
      ? `${pendingRows} linha(s) com pendência para revisão. Exportação TD liberada.`
      : 'Exportação TD liberada.';
    showAlert(el, 'success', `${state.dadosFinal.length} registro(s) processado(s) a partir de ${hospitalFiles.length + cieloFiles.length} arquivo(s). ${exportMessage}`);
  } catch (error) {
    console.error(error);
    showAlert(el, 'error', error.message || 'Não foi possível processar os arquivos.');
  } finally {
    setLoading(el, state, false);
  }
}

async function parseHospitalFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ext === 'pdf' ? parseTasyPdf(file) : parseBiMv(file);
}

async function parseHospitalFiles(files) {
  const results = await Promise.all(files.map(parseHospitalFile));
  return mergeParseResults(results, {
    source: results.some(result => result.source === 'PDF_TASY') ? 'PDF_TASY' : 'BI_MV',
  });
}

async function parseCieloFiles(files) {
  const results = await Promise.all(files.map(parseCielo));
  return mergeParseResults(results, { source: 'CIELO' });
}

function mergeParseResults(results, defaults) {
  return results.reduce((acc, result) => ({
    rows: [...acc.rows, ...(result.rows || [])],
    warnings: [...acc.warnings, ...(result.warnings || [])],
    ignoredRows: acc.ignoredRows + (result.ignoredRows || 0),
    ignoredLines: acc.ignoredLines + (result.ignoredLines || 0),
    pagesRead: acc.pagesRead + (result.pagesRead || 0),
    source: acc.source || result.source,
  }), { rows: [], warnings: [], ignoredRows: 0, ignoredLines: 0, pagesRead: 0, ...defaults });
}

function atualizar(index, campo, valor) {
  const row = { ...state.dadosFinal[index] };
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

  state.dadosFinal[index] = reconcileOne(row, buildCieloIndex(state.cieloRows));
  renderAll(el, state, handleFilterChange);
}

function limparArquivos() {
  el.hospitalFile.value = '';
  el.cieloFile.value = '';
  state.hospitalRows = [];
  state.cieloRows = [];
  state.dadosFinal = [];
  state.warnings = [];
  state.lastSource = '';
  state.parsedInfo = null;
  state.currentFilter = 'todos';

  showAlert(el, '', '');
  renderAll(el, state, handleFilterChange);
  renderUploadSummary(el);
}

function setupDropZone(dropZone, input, acceptedExtensions, invalidMessage) {
  const stopDefaults = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      stopDefaults(event);
      dropZone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      stopDefaults(event);
      dropZone.classList.remove('is-dragging');
    });
  });

  dropZone.addEventListener('drop', event => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;

    const invalidFile = files.find(file => !acceptedExtensions.includes(file.name.split('.').pop().toLowerCase()));
    if (invalidFile) {
      showAlert(el, 'error', `${invalidFile.name}: ${invalidMessage}`);
      return;
    }

    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    showAlert(el, '', '');
  });
}

function exportarTd() {
  try {
    state.dadosFinal = reconcileRows(state.dadosFinal, state.cieloRows);
    renderAll(el, state, handleFilterChange);

    const result = exportTd(state.dadosFinal, { source: state.lastSource });
    showAlert(el, 'success', `${result.filename} gerado com ${result.rowCount} linha(s) distribuída(s) em ${result.sheetCount} aba(s).`);
  } catch (error) {
    console.error(error);
    showAlert(el, 'error', error.message || 'Não foi possível gerar o arquivo .xlsx.');
  }
}

function validateRuntimeDependencies() {
  const missing = [];
  if (!window.Papa) missing.push('PapaParse');
  if (!window.XLSX) missing.push('SheetJS/XLSX');
  if (!window.pdfjsLib) missing.push('pdf.js');

  if (!missing.length) return;

  el.processBtn.disabled = true;
  el.exportBtn.disabled = true;
  showAlert(el, 'error', `Bibliotecas locais não carregadas: ${missing.join(', ')}. Verifique os arquivos em src/vendor.`);
}

function handleFilterChange(filter) {
  state.currentFilter = filter;
  renderAll(el, state, handleFilterChange);
}

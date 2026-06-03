import { parseBiMv } from './parsers/biMvParser.js';
import { parseCielo } from './parsers/cieloParser.js';
import { parseTasyPdf } from './parsers/pdfTasyParser.js';
import { buildCieloIndex, reconcileOne, reconcileRows } from './services/reconciliation.js';
import { exportTd } from './services/exportTd.js';
import { normalizeAuth, parseMoneyBR } from './utils/format.js';
import { getElements } from './ui/dom.js';
import { renderAll, renderUploadSummary, setLoading, showAlert } from './ui/render.js';

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
setupDropZone(el.hospitalDropZone, el.hospitalFile, ['csv', 'xlsx', 'xls', 'pdf'], 'Use CSV, XLSX, XLS ou PDF no arquivo hospitalar.');
setupDropZone(el.cieloDropZone, el.cieloFile, ['csv'], 'Use apenas CSV no arquivo Cielo.');
el.tabelaBody.addEventListener('change', event => {
  const input = event.target.closest('input.edit');
  if (!input) return;
  atualizar(Number(input.dataset.index), input.dataset.field, input.value);
});

renderAll(el, state, handleFilterChange);
renderUploadSummary(el);

async function processar() {
  const hospitalFile = el.hospitalFile.files[0];
  const cieloFile = el.cieloFile.files[0];
  if (!hospitalFile || !cieloFile) {
    showAlert(el, 'error', 'Importe o arquivo hospitalar e o arquivo Cielo antes de processar.');
    return;
  }

  setLoading(el, state, true);
  showAlert(el, '', '');

  try {
    const [hospitalResult, cieloResult] = await Promise.all([
      parseHospitalFile(hospitalFile),
      parseCielo(cieloFile),
    ]);

    state.hospitalRows = hospitalResult.rows;
    state.cieloRows = cieloResult.rows;
    state.dadosFinal = reconcileRows(state.hospitalRows, state.cieloRows);
    state.warnings = [...(hospitalResult.warnings || []), ...(cieloResult.warnings || [])];
    if (hospitalResult.ignoredRows) state.warnings.push(`${hospitalResult.ignoredRows} linha(s) ignorada(s) no BI/MV.`);
    if (hospitalResult.ignoredLines) state.warnings.push(`${hospitalResult.ignoredLines} linha(s) ignorada(s) no PDF Tasy.`);
    state.lastSource = hospitalResult.source;
    state.parsedInfo = hospitalResult;
    state.currentFilter = 'todos';

    renderAll(el, state, handleFilterChange);
    showAlert(el, 'success', `${state.dadosFinal.length} registro(s) processado(s). Revise as pendências antes de exportar.`);
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

function atualizar(index, campo, valor) {
  const row = { ...state.dadosFinal[index] };
  if (['valorCartao', 'valorDinheiro', 'valorFatura'].includes(campo)) row[campo] = parseMoneyBR(valor);
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
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    if (!acceptedExtensions.includes(extension)) {
      showAlert(el, 'error', invalidMessage);
      return;
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    showAlert(el, '', '');
  });
}

function exportarTd() {
  try {
    const result = exportTd(state.dadosFinal);
    showAlert(el, 'success', `${result.filename} gerado com ${result.rowCount} linha(s) na aba TD.`);
  } catch (error) {
    console.error(error);
    showAlert(el, 'error', error.message || 'Não foi possível gerar o arquivo .xlsx.');
  }
}

function handleFilterChange(filter) {
  state.currentFilter = filter;
  renderAll(el, state, handleFilterChange);
}

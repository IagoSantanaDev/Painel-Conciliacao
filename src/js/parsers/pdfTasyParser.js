import { normalizeText } from '../utils/string.js';
import {
  normalizeAuth,
  normalizeBrand,
  normalizePaymentMethod,
  normalizePdfBrand,
  parseMoneyBR,
} from '../utils/format.js';
import { deduplicateHospitalRows } from '../utils/dedupe.js';
import { ID_PREFIX } from '../constants.js';
import { createHospitalRow } from './_shared.js';

const RECEIPT_CARD_RX = /CX\s*-\s*Recebimento\s+Cart[aã]o\s+de\s+(Cr[eé]dito|Credito|D[eé]bito|Debito)/i;

export const RECEIPT_ESPECIE_RX = /CX\s*-\s*Recebimento\s+Esp[eé]cie/i;

const TOTAL_ROW_RX = /^total\(/i;
const IGNORE_SUBSTRINGS = new Set([
  'te - transferencia',
  'total de documentos',
  'impresso em',
  'pagina:',
  'rel:',
  'desktop:',
  'server:',
  'saldo inicial',
  'saldo final',
]);

let _pdfjsLib = null;
let _pdfjsVersion = null;
let _loadingPromise = null;

const _isBrowser = typeof globalThis.location !== 'undefined';
const PDFJS_PATH = _isBrowser ? '/src/vendor/pdf.min.mjs' : '../../vendor/pdf.min.mjs';
const PDFJS_WORKER_PATH = _isBrowser ? '/src/vendor/pdf.worker.min.mjs' : '../../vendor/pdf.worker.min.mjs';

const PDFJS_EXPECTED_HASH = 'c3caae2cf1fe9d6e25588d0d239d02454422778ed5897314981496a4656eab82';
const PDFJS_WORKER_EXPECTED_HASH = 'ee61de6dd3effd826b7083739409e50bae43c2e41a896f27ea8dd2d77e2f349b';

const MAX_PDF_PAGES = 2000;
const PDF_TEXT_FETCH_TIMEOUT_MS = 10000;

async function _verifyHash(url, expectedHash, label) {
  const isBrowser = typeof globalThis.location !== 'undefined';
  if (!isBrowser) return;

  if (!expectedHash) {
    throw new Error(`PDFJS ${label} hash expected but not configured — refusing to load.`);
  }

  if (!globalThis.crypto?.subtle) {
    console.warn(
      `[pdfTasyParser] crypto.subtle indisponível neste contexto. ` +
      `SRI de ${label} (${url}) pulado. Use HTTPS ou localhost para verificação de integridade.`,
    );
    return;
  }

  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`fetch(${url}) HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  if (hashHex !== expectedHash) {
    throw new Error(
      `SRI mismatch para ${url}: esperado ${expectedHash}, ` +
      `obtido sha256-${hashHex}. Arquivo pode ter sido adulterado.`
    );
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms)),
  ]);
}

async function getPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;

  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {

    await _verifyHash(PDFJS_PATH, PDFJS_EXPECTED_HASH, 'pdf.min.mjs');
    await _verifyHash(PDFJS_WORKER_PATH, PDFJS_WORKER_EXPECTED_HASH, 'pdf.worker.min.mjs');
    const pdfjsLib = await import(PDFJS_PATH);

    if (typeof pdfjsLib.getDocument !== 'function' ||
        !pdfjsLib.GlobalWorkerOptions ||
        !pdfjsLib.version) {
      throw new Error(
        'Módulo pdf.min.mjs inválido ou corrompido: API esperada não encontrada. ' +
        'Verifique se o arquivo em src/vendor/pdf.min.mjs é autêntico.'
      );
    }

    _pdfjsVersion = pdfjsLib.version;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
    }
    _pdfjsLib = pdfjsLib;
    if (typeof location !== 'undefined' && location.hostname === 'localhost') {
      console.info(`[pdfTasyParser] pdf.js v${_pdfjsVersion} loaded`);
    }
    return _pdfjsLib;
  })();

  return _loadingPromise;
}

export async function parseTasyPdf(file) {
  const pdfjsLib = await getPdfJs();

  const data = await file.arrayBuffer();
  const pdf = await loadPdfDocument(pdfjsLib, data);
  const warnings = [];
  const rows = [];
  let ignoredLines = 0;
  let operador = '';

  let currentDocumentInfo = createDocumentTracker();

  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
  if (pdf.numPages > MAX_PDF_PAGES) {
    warnings.push(`PDF com ${pdf.numPages} páginas excede limite de ${MAX_PDF_PAGES}. Apenas as primeiras ${MAX_PDF_PAGES} serão processadas.`);
  }

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
    const page = await withTimeout(pdf.getPage(pageNumber), PDF_TEXT_FETCH_TIMEOUT_MS, `getPage(${pageNumber})`);
    const textContent = await withTimeout(page.getTextContent(), PDF_TEXT_FETCH_TIMEOUT_MS, `getTextContent(${pageNumber})`);
    const { lines } = groupPdfTextItems(textContent.items);

    for (let i = 0; i < lines.length; i++) {
      const line = cleanLine(lines[i]);
      if (!line) continue;

      const opMatch = line.match(/^(.+?)\s+Dt\s+Saldo:/i);
      if (opMatch) operador = cleanOperatorName(opMatch[1]);
      const documentInfo = extractTasyDocumentInfo(line);
      ingestDocumentInfo(currentDocumentInfo, documentInfo);
      if (shouldIgnorePdfLine(line)) { ignoredLines++; continue; }

      const directRows = extractTasyRowsFromLine(line, pageNumber, operador, currentDocumentInfo);
      if (directRows.length) {
        consumeDocumentInfo(currentDocumentInfo);
        rows.push(...directRows);
        continue;
      }

      const authMatch = matchTasyAuthorization(line);
      if (!authMatch) continue;

      let valueLine = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
        const candidate = cleanLine(lines[j]);
        if (shouldIgnorePdfLine(candidate)) continue;
        if (RECEIPT_CARD_RX.test(candidate)) { valueLine = candidate; break; }
        if (/Aut:\s*/i.test(candidate)) break;
      }

      if (!valueLine) {
        warnings.push(`Página ${pageNumber}: autorização ${authMatch.autorizador} sem linha de recebimento cartão associada.`);
        continue;
      }

      const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/) || valueLine.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
      if (!dateMatch) { ignoredLines++; continue; }

      const amount = extractReceiptAmount(valueLine, RECEIPT_CARD_RX);
      if (!amount) {
        warnings.push(`Página ${pageNumber}: não foi possível extrair valor da autorização ${authMatch.autorizador}.`);
        continue;
      }

      consumeDocumentInfo(currentDocumentInfo);
      rows.push(createPdfCardRow({ pageNumber, operador, line, valueLine, dateMatch, authMatch, amount, documentInfo: currentDocumentInfo }));
    }

    page.cleanup && page.cleanup();
  }

  if (!rows.length) throw new Error('Nenhuma transação válida foi encontrada no PDF.');
  const deduplicated = deduplicateHospitalRows(rows);
  return { rows: deduplicated, warnings, ignoredLines, pagesRead: pdf.numPages, source: 'PDF_TASY' };
}

async function loadPdfDocument(pdfjsLib, data) {

  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    isEvalSupported: false,
  });
  try {
    return await loadingTask.promise;
  } catch (error) {
    if (!isPdfWorkerLoadError(error)) throw error;

    console.warn('[pdfTasyParser] Falha no worker; tentando sem worker.', error?.name || 'Error');
    const fallbackTask = pdfjsLib.getDocument({
      data: uint8,
      isEvalSupported: false,
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    return await fallbackTask.promise;
  }
}

function isPdfWorkerLoadError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Setting up fake worker failed')
    || message.includes('Cannot load script')
    || message.includes('Failed to construct')
    || message.includes('Worker')

    || message.includes('DataCloneError')
    || message.includes('structuredClone')
    || message.includes('Cannot transfer object')
    || message.includes('No "GlobalWorkerOptions.workerSrc"');
}

function groupPdfTextItems(items) {
  const parsed = items
    .filter(item => String(item.str || '').trim())
    .map(item => ({ str: String(item.str).trim(), x: item.transform[4], y: item.transform[5] }));

  const dateItems = parsed.filter(item => /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(item.str));
  const spread = (values, key) => values.length ? Math.max(...values.map(item => item[key])) - Math.min(...values.map(item => item[key])) : 0;
  const axis = dateItems.length >= 2 && spread(dateItems, 'x') > spread(dateItems, 'y') * 2 ? 'x' : 'y';
  const otherAxis = axis === 'x' ? 'y' : 'x';
  const tolerance = axis === 'x' ? 3 : 2;

  const sortedByAxis = parsed.slice().sort((a, b) => a[axis] - b[axis]);
  const groups = [];
  for (const item of sortedByAxis) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.axis - item[axis]) <= tolerance) {
      last.items.push(item);
    } else {
      groups.push({ axis: item[axis], items: [item] });
    }
  }

  const lines = groups
    .sort((a, b) => axis === 'x' ? a.axis - b.axis : b.axis - a.axis)
    .map(group => cleanLine(group.items.sort((a, b) => a[otherAxis] - b[otherAxis]).map(item => item.str).join(' ')))
    .filter(Boolean);

  return { axis, lines };
}

function extractTasyDocumentInfo(line) {
  const marker = line.search(/CX\s*-\s*Recebimento\s+de\s+T[ií]tulo\s+Particular/i);
  if (marker < 0) return { titulo: '', notaFiscal: '' };

  const tail = line.slice(marker).replace(/CX\s*-\s*Recebimento\s+de\s+T[ií]tulo\s+Particular/i, '').trim();
  const tokens = tail.split(/\s+/).filter(Boolean);
  const tituloIndex = tokens.findIndex(token => isDocumentToken(token));
  const titulo = tituloIndex >= 0 ? tokens[tituloIndex] : '';
  const notaFiscal = tituloIndex >= 0 ? (tokens.slice(tituloIndex + 1).find(token => isDocumentToken(token)) || '') : '';

  return { titulo, notaFiscal };
}

function isDocumentToken(token) {
  return /^\d+$/.test(token) && !/^0+$/.test(token);
}

function matchTasyAuthorization(line) {
  const match = line.match(/Aut:\s*([A-Za-z0-9-]+)\s*-\s*CV\/Doc:\s*-\s*(Cr[eé]dito|Credito|D[eé]bito|Debito)\s*-\s*(.*?)(?=\s+CX\s*-|\s+TE\s*-|\s+[\d.]+,\d{2}|$)/i);
  if (!match) return null;
  return {
    autorizador: normalizeAuth(match[1]),
    forma: normalizePaymentMethod(match[2]),
    bandeira: normalizePdfBrand(match[3]),
  };
}

function extractTasyRowsFromLine(line, pageNumber, operador, documentInfo = { titulo: '', notaFiscal: '' }) {
  const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
  if (!dateMatch) return [];

  const rows = [];
  const authMatch = matchTasyAuthorization(line);
  if (authMatch && RECEIPT_CARD_RX.test(line)) {
    const amount = extractReceiptAmount(line, RECEIPT_CARD_RX);
    if (amount) rows.push(createPdfCardRow({ pageNumber, operador, line, valueLine: line, dateMatch, authMatch, amount, documentInfo }));
  }

  if (RECEIPT_ESPECIE_RX.test(line)) {
    const amount = extractReceiptAmount(line, RECEIPT_ESPECIE_RX);
    if (amount) rows.push(createPdfCashRow({ pageNumber, operador, line, dateMatch, amount, documentInfo }));
  }

  return rows;
}

function extractReceiptAmount(line, receiptRegex) {
  const start = line.search(receiptRegex);
  if (start < 0) return '';
  const segment = line.slice(start);
  const amounts = [...segment.matchAll(/[\d.]+,\d{2}/g)].map(match => match[0]).filter(value => value !== '0,00');
  return amounts[0] || '';
}

function createPdfCardRow({ pageNumber, operador, line, valueLine, dateMatch, authMatch, amount, documentInfo = { titulo: '', notaFiscal: '' } }) {
  return createPdfRow({ type: 'card', pageNumber, operador, line, valueLine, dateMatch, authMatch, amount, documentInfo });
}

function createPdfCashRow({ pageNumber, operador, line, dateMatch, amount, documentInfo = { titulo: '', notaFiscal: '' } }) {
  return createPdfRow({ type: 'cash', pageNumber, operador, line, dateMatch, amount, documentInfo });
}

function createPdfRow({ type, pageNumber, operador, line, valueLine, dateMatch, authMatch, amount, documentInfo = { titulo: '', notaFiscal: '' } }) {
  const valor = parseMoneyBR(amount);
  const isCard = type === 'card';
  const idPrefix = isCard ? ID_PREFIX.PDF_CARD : ID_PREFIX.PDF_CASH;
  const index = isCard ? `${pageNumber}-${authMatch.autorizador}` : `${pageNumber}-${dateMatch[2]}`;
  const baseObs = isCard ? 'Extraído do PDF Tasy' : 'Recebimento em espécie extraído do PDF Tasy';
  const raw = isCard ? { pageNumber, authLine: line, valueLine, documentInfo } : { pageNumber, line, documentInfo };

  return createHospitalRow({
    idPrefix,
    index,
    dataPagamento: dateMatch[1],
    horaPagamento: dateMatch[2],
    registro: documentInfo.titulo || '',
    tituloTasy: documentInfo.titulo || '',
    caixa: operador,
    contaFatura: documentInfo.notaFiscal || '',
    autorizadorDoc: '',
    ...(isCard ? {
      autorizador: authMatch.autorizador,
      valorCartao: valor,
      formaPagamento: authMatch.forma,
      tipoCartao: authMatch.forma,
      bandeira: authMatch.bandeira,
    } : {
      valorDinheiro: valor,
      formaPagamento: 'ESPÉCIE',
    }),
    valorFatura: valor,
    observacoes: [baseObs],
    raw,
  });
}

function cleanOperatorName(value) {
  return String(value || '').replace(/Impresso em:.*/i, '').trim();
}

function cleanLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function shouldIgnorePdfLine(line) {
  const n = normalizeText(line);
  if (!n) return true;
  for (const substr of IGNORE_SUBSTRINGS) {
    if (n.includes(substr)) return true;
  }
  return TOTAL_ROW_RX.test(n);
}

export function createDocumentTracker() {
  return { titulo: '', notaFiscal: '', consumed: true };
}

export function ingestDocumentInfo(tracker, incoming) {
  if (incoming?.titulo || incoming?.notaFiscal) {
    tracker.titulo = incoming.titulo || '';
    tracker.notaFiscal = incoming.notaFiscal || '';
    tracker.consumed = false;
  }
  return tracker;
}

export function consumeDocumentInfo(tracker) {
  if (tracker.consumed) return { titulo: '', notaFiscal: '' };
  tracker.consumed = true;
  return tracker;
}

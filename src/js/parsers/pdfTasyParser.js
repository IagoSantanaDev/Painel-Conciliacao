import {
  createId,
  normalizeAuth,
  normalizeBrand,
  normalizePaymentMethod,
  normalizeText,
  parseMoneyBR,
} from '../utils/format.js';

/** Deduplica registros do PDF pelo autorizador + campos financeiros + bandeira/parcelas. */
function deduplicatePdfRows(rows) {
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
      row.registro,
      row.lote,
      row.caixa,
      row.dataPagamento,
      row.horaPagamento,
    ].join('|');
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(row);
    }
  }
  return result;
}

export async function parseTasyPdf(file) {
  if (!window.pdfjsLib) throw new Error('Biblioteca pdf.js não carregada.');

  const data = await file.arrayBuffer();
  const pdf = await loadPdfDocument(data);
  const warnings = [];
  const rows = [];
  let ignoredLines = 0;
  let operador = '';
  let currentDocumentInfo = { titulo: '', notaFiscal: '' };

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const { lines } = groupPdfTextItems(textContent.items);

    for (let i = 0; i < lines.length; i++) {
      const line = cleanLine(lines[i]);
      if (!line) continue;

      const opMatch = line.match(/^(.+?)\s+Dt\s+Saldo:/i);
      if (opMatch) operador = cleanOperatorName(opMatch[1]);
      const documentInfo = extractTasyDocumentInfo(line);
      if (documentInfo.titulo || documentInfo.notaFiscal) currentDocumentInfo = documentInfo;
      if (shouldIgnorePdfLine(line)) { ignoredLines++; continue; }

      const directRows = extractTasyRowsFromLine(line, pageNumber, operador, currentDocumentInfo);
      if (directRows.length) {
        rows.push(...directRows);
        continue;
      }

      const authMatch = matchTasyAuthorization(line);
      if (!authMatch) continue;

      let valueLine = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
        const candidate = cleanLine(lines[j]);
        if (shouldIgnorePdfLine(candidate)) continue;
        if (/CX\s*-\s*Recebimento\s+Cart[aã]o\s+de\s+(Cr[eé]dito|Credito|D[eé]bito|Debito)/i.test(candidate)) { valueLine = candidate; break; }
        if (/Aut:\s*/i.test(candidate)) break;
      }

      if (!valueLine) {
        warnings.push(`Página ${pageNumber}: autorização ${authMatch.autorizador} sem linha de recebimento cartão associada.`);
        continue;
      }

      const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/) || valueLine.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
      if (!dateMatch) { ignoredLines++; continue; }

      const amount = extractReceiptAmount(valueLine, /CX\s*-\s*Recebimento\s+Cart[aã]o\s+de\s+(Cr[eé]dito|Credito|D[eé]bito|Debito)/i);
      if (!amount) {
        warnings.push(`Página ${pageNumber}: não foi possível extrair valor da autorização ${authMatch.autorizador}.`);
        continue;
      }

      rows.push(createPdfCardRow({ pageNumber, operador, line, valueLine, dateMatch, authMatch, amount, documentInfo: currentDocumentInfo }));
    }

    page.cleanup && page.cleanup();
  }

  if (!rows.length) throw new Error('Nenhuma transação válida foi encontrada no PDF.');
  const deduplicated = deduplicatePdfRows(rows);
  return { rows: deduplicated, warnings, ignoredLines, pagesRead: pdf.numPages, source: 'PDF_TASY' };
}

async function loadPdfDocument(data) {
  try {
    return await getPdfDocument(data, false);
  } catch (error) {
    if (!isPdfWorkerLoadError(error)) throw error;
    console.warn('Falha ao carregar worker do pdf.js; usando fallback sem worker.', error);
    return getPdfDocument(data, true);
  }
}

function getPdfDocument(data, disableWorker) {
  return window.pdfjsLib.getDocument({
    data: new Uint8Array(data.slice(0)),
    disableWorker,
  }).promise;
}

function isPdfWorkerLoadError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Setting up fake worker failed')
    || message.includes('Cannot load script')
    || message.includes('Failed to construct')
    || message.includes('Worker');
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
  const groups = [];

  for (const item of parsed) {
    let group = groups.find(existing => Math.abs(existing.axis - item[axis]) <= tolerance);
    if (!group) { group = { axis: item[axis], items: [] }; groups.push(group); }
    group.items.push(item);
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
  const match = line.match(/Aut:\s*([A-Za-z0-9]+)\s*-\s*CV\/Doc:\s*-\s*(Cr[eé]dito|Credito|D[eé]bito|Debito)\s*-\s*(.*?)(?=\s+CX\s*-|\s+TE\s*-|\s+[\d.]+,\d{2}|$)/i);
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
  if (authMatch && /CX\s*-\s*Recebimento\s+Cart[aã]o\s+de\s+(Cr[eé]dito|Credito|D[eé]bito|Debito)/i.test(line)) {
    const amount = extractReceiptAmount(line, /CX\s*-\s*Recebimento\s+Cart[aã]o\s+de\s+(Cr[eé]dito|Credito|D[eé]bito|Debito)/i);
    if (amount) rows.push(createPdfCardRow({ pageNumber, operador, line, valueLine: line, dateMatch, authMatch, amount, documentInfo }));
  }

  if (/CX\s*-\s*Recebimento\s+Especie/i.test(line)) {
    const amount = extractReceiptAmount(line, /CX\s*-\s*Recebimento\s+Especie/i);
    if (amount) rows.push(createPdfCashRow({ pageNumber, operador, line, dateMatch, amount }));
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
  const valorCartao = parseMoneyBR(amount);
  return {
    idInterno: createId('pdf-card', `${pageNumber}-${authMatch.autorizador}`),
    origem: 'PDF_TASY',
    dataPagamento: dateMatch[1],
    horaPagamento: dateMatch[2],
    registro: documentInfo.titulo || '',
    caixa: operador,
    lote: '',
    contaFatura: documentInfo.notaFiscal || '',
    autorizador: authMatch.autorizador,
    valorCartao,
    valorDinheiro: 0,
    valorFatura: valorCartao,
    desconto: '',
    formaPagamento: authMatch.forma,
    tipoCartao: authMatch.forma,
    bandeira: authMatch.bandeira,
    parcelas: '',
    observacoes: ['Extraído do PDF Tasy'],
    raw: { pageNumber, authLine: line, valueLine, documentInfo },
  };
}

function createPdfCashRow({ pageNumber, operador, line, dateMatch, amount }) {
  const valor = parseMoneyBR(amount);
  return {
    idInterno: createId('pdf-dinheiro', `${pageNumber}-${dateMatch[2]}`),
    origem: 'PDF_TASY',
    dataPagamento: dateMatch[1],
    horaPagamento: dateMatch[2],
    registro: '',
    caixa: operador,
    lote: '',
    contaFatura: '',
    autorizador: '',
    valorCartao: 0,
    valorDinheiro: valor,
    valorFatura: valor,
    desconto: '',
    formaPagamento: 'ESPÉCIE',
    tipoCartao: '',
    bandeira: '',
    parcelas: '',
    observacoes: ['Recebimento em espécie extraído do PDF Tasy'],
    raw: { pageNumber, line },
  };
}

function normalizePdfBrand(value) {
  const text = String(value || '').replace(/-+\s*$/, '').trim();
  const normalized = normalizeText(text);
  if (normalized.includes('american express')) return 'AMERICAN EXPRESS';
  if (normalized.includes('master')) return 'MASTERCARD';
  if (normalized.includes('visa')) return 'VISA';
  if (normalized.includes('elo')) return 'ELO';
  if (normalized.includes('hiper')) return 'HIPERCARD';
  return normalizeBrand(text.split(' - ')[0]);
}

function cleanOperatorName(value) {
  return String(value || '').replace(/Impresso em:.*/i, '').trim();
}

function cleanLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function shouldIgnorePdfLine(line) {
  const n = normalizeText(line);
  return !n
    || n.includes('te - transferencia')
    || n.includes('total de documentos')
    || /^total\(/.test(n)
    || n.includes('impresso em')
    || n.includes('pagina:')
    || n.includes('rel:')
    || n.includes('desktop:')
    || n.includes('server:')
    || n.includes('saldo inicial')
    || n.includes('saldo final');
}

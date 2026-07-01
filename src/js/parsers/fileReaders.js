const XLSX_MAGIC = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
const PDF_MAGIC  = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const CSV_SAMPLE_LINES = 200;

function isProbablyText(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 512));
  for (const b of bytes) {
    if (b === 0) return false;
  }
  return true;
}

function hasZipMagic(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4B;
}

function hasValidMagicBytes(buffer, expectedExt) {
  if (expectedExt === 'csv') {
    return isProbablyText(buffer);
  }
  if (expectedExt === 'ods') {
    return hasZipMagic(buffer);
  }
  const magic = expectedExt === 'xlsx' ? XLSX_MAGIC : PDF_MAGIC;
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return magic.every((b, i) => bytes[i] === b);
}

function detectCsvDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, CSV_SAMPLE_LINES).join('\n');
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function readCsvText(buffer) {

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
  }
}

export async function parseCsvRows(file) {
  const buffer = await file.arrayBuffer();
  if (!isProbablyText(buffer)) {
    throw new Error(`O arquivo '${file.name ?? 'sem nome'}' não parece ser um CSV válido (conteúdo binário detectado).`);
  }
  const text = readCsvText(buffer);
  const delimiter = detectCsvDelimiter(text);
  return new Promise((resolve, reject) => {
    window.Papa.parse(text, {
      delimiter,
      worker: true,
      skipEmptyLines: false,
      complete(results) {
        if (results.errors && results.errors.length) {

          console.warn(`PapaParse: ${results.errors.length} warning(s)`);
        }
        resolve(results.data || []);
      },
      error(error) { reject(error); },
    });
  });
}

const XLSX_READ_OPTIONS = Object.freeze({
  type: 'array',
  bookVBA: false,
  cellHTML: false,
  cellFormula: false,
});
const MAX_ROWS = 50000;
export const MAX_WORKBOOK_ROWS = MAX_ROWS;

function readFirstSheetAsRows(ab, filename) {
  const workbook = window.XLSX.read(new Uint8Array(ab), XLSX_READ_OPTIONS);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const truncated = rawRows.length > MAX_ROWS;
  if (truncated) {

    console.warn(`Planilha (${filename.length} chars) com ${rawRows.length} linhas — limitando às primeiras ${MAX_ROWS}.`);
  }
  return { rows: rawRows.slice(0, MAX_ROWS), truncated };
}

export async function parseWorkbookRows(file) {
  if (typeof file.arrayBuffer !== 'function') {
    throw new Error(`Arquivo inválido: '${file.name ?? 'sem nome'}' — esperado File/Blob com método arrayBuffer().`);
  }
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() || '';
  const ab = await file.arrayBuffer();
  const filename = file.name ?? 'sem nome';

  const ZIP_CONTAINER_EXTS = new Set(['xlsx', 'xlsm', 'xlsb', 'ods']);
  if (ZIP_CONTAINER_EXTS.has(ext)) {
    if (!hasZipMagic(ab)) {
      throw new Error(`O arquivo '${filename}' não é um ${ext.toUpperCase()} válido (magic bytes inválidos).`);
    }
  }

  return readFirstSheetAsRows(ab, filename);
}

export function rowsToObjects(rows, headerIndex) {
  const header = (rows[headerIndex] || []).map(cell => String(cell ?? '').trim());
  return rows.slice(headerIndex + 1).map(row => {
    const obj = Object.create(null);
    header.forEach((key, index) => {
      if (key) obj[key] = row?.[index] ?? '';
    });
    return obj;
  });
}

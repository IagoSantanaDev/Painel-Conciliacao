function detectCsvDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 80).join('\n');
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

async function readCsvText(file) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8Text.includes('\uFFFD')) return utf8Text;
  return new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
}

export async function parseCsvRows(file) {
  const text = await readCsvText(file);
  const delimiter = detectCsvDelimiter(text);
  return new Promise((resolve, reject) => {
    window.Papa.parse(text, {
      delimiter,
      skipEmptyLines: false,
      complete(results) {
        if (results.errors && results.errors.length) {
          console.warn('PapaParse CSV warnings', results.errors);
        }
        resolve(results.data || []);
      },
      error(error) { reject(error); },
    });
  });
}

export async function parseCsvObjects(file) {
  const text = await readCsvText(file);
  const delimiter = detectCsvDelimiter(text);
  return new Promise((resolve, reject) => {
    window.Papa.parse(text, {
      delimiter,
      header: true,
      skipEmptyLines: true,
      complete(results) {
        resolve({ rows: results.data || [], errors: results.errors || [] });
      },
      error(error) { reject(error); },
    });
  });
}

export async function parseWorkbookRows(file) {
  const ab = await file.arrayBuffer();
  const workbook = window.XLSX.read(new Uint8Array(ab), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
}

export function rowsToObjects(rows, headerIndex) {
  const header = (rows[headerIndex] || []).map(cell => String(cell ?? '').trim());
  return rows.slice(headerIndex + 1).map(row => {
    const obj = {};
    header.forEach((key, index) => {
      if (key) obj[key] = row[index] ?? '';
    });
    return obj;
  });
}

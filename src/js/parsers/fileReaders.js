function detectCsvDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

export async function parseCsvRows(file) {
  const text = await file.text();
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
  const text = await file.text();
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
  const workbook = window.XLSX.read(ab);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
}

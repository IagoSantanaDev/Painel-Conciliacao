export const SPREADSHEET_EXTENSIONS = Object.freeze(['csv', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods']);
export const HOSPITAL_EXTENSIONS = Object.freeze([...SPREADSHEET_EXTENSIONS, 'pdf']);

export function getFileExt(file) {
  const name = (file && file.name) || '';
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toLowerCase() : '';
}

export function isPdfFile(file) {
  return getFileExt(file) === 'pdf';
}

export function isCsvFile(file) {
  return getFileExt(file) === 'csv';
}

export function isSpreadsheetFile(file) {
  return SPREADSHEET_EXTENSIONS.includes(getFileExt(file));
}

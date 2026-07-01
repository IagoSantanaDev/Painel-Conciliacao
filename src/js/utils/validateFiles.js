import { getFileExt } from './fileExt.js';

export const MAX_BYTES_PER_FILE = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 50;

export function validateFiles(files, allowedExtensions, label, options = {}) {
  const { maxBytes = MAX_BYTES_PER_FILE, customMsg, maxFiles = MAX_FILES_PER_UPLOAD } = options;
  if (files.length > maxFiles) {
    throw new Error(`${label}: ${files.length} arquivo(s) excede o limite de ${maxFiles} por envio.`);
  }
  const exts = allowedExtensions.map(e => e.toLowerCase());
  for (const file of files) {
    const ext = getFileExt(file);
    if (!exts.includes(ext)) {
      const msg = customMsg || `extensão ".${ext}" não permitida para ${file.name}.`;
      throw new Error(`${label}: ${msg}`);
    }
    if (file.size > maxBytes) {
      const mb = (maxBytes / 1024 / 1024).toFixed(0);
      const fileMb = (file.size / 1024 / 1024).toFixed(2);
      throw new Error(`${label}: ${file.name} (${fileMb} MB) excede o limite de ${mb} MB por arquivo.`);
    }
  }
}

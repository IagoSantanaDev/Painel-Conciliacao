import { normalizeText } from '../utils/string.js';

const XLSX_READ_OPTIONS = Object.freeze({
  type: 'array',
  bookVBA: false,
  cellHTML: false,
  cellFormula: false,
});

function isValidXlsx(file) {
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() || '';
  return ext === 'xlsx';
}

function normalizeValue(value) {
  return String(value ?? '').trim().replace(/\.0$/, '');
}

export async function parseAtendimento(file) {
  if (!isValidXlsx(file)) {
    throw new Error('Planilha de atendimento deve ser um arquivo .xlsx.');
  }

  const ab = await file.arrayBuffer();
  const uint8 = new Uint8Array(ab.slice(0, 4));
  if (uint8[0] !== 0x50 || uint8[1] !== 0x4B) {
    throw new Error(`O arquivo '${file.name ?? 'sem nome'}' nao e um XLSX valido (magic bytes invalidos).`);
  }

  const workbook = window.XLSX.read(new Uint8Array(ab), XLSX_READ_OPTIONS);
  const warnings = [];
  const allPairs = [];
  let sheetFound = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

    if (!rows || rows.length === 0) continue;

    let tituloIdx = -1;
    let atendimentoIdx = -1;
    let headerRow = -1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      let foundTitulo = -1;
      let foundAtendimento = -1;

      for (let c = 0; c < row.length; c++) {
        const norm = normalizeText(String(row[c] ?? ''));
        if (norm.includes('titulo')) foundTitulo = c;
        if (norm.includes('atendimento')) foundAtendimento = c;
      }

      if (foundTitulo >= 0 && foundAtendimento >= 0) {
        tituloIdx = foundTitulo;
        atendimentoIdx = foundAtendimento;
        headerRow = r;
        break;
      }
    }

    if (headerRow < 0) continue;

    sheetFound = true;

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const titulo = normalizeValue(row[tituloIdx]);
      const atendimento = normalizeValue(row[atendimentoIdx]);

      if (!titulo || !atendimento) continue;

      allPairs.push({ titulo, atendimento, sheetName, rowNumber: r + 1 });
    }
  }

  if (!sheetFound) {
    throw new Error(
      'Nenhuma aba com as colunas "Titulo" e "Atendimento" foi encontrada no arquivo.'
    );
  }

  const index = new Map();

  for (const { titulo, atendimento, sheetName, rowNumber } of allPairs) {
    if (!index.has(titulo)) {
      index.set(titulo, atendimento);
    } else {
      const existing = index.get(titulo);
      if (existing !== atendimento) {
        throw new Error(
          `O titulo ${titulo} esta associado aos atendimentos ${existing} e ${atendimento}. ` +
          `Conflito encontrado na aba "${sheetName}", linha ${rowNumber}. ` +
          'Corrija as planilhas de atendimento antes de continuar.'
        );
      }
    }
  }

  return { index, warnings, pairs: index.size };
}

export function consolidateAtendimentoIndices(results) {
  const consolidated = new Map();
  const warnings = [];

  for (const result of results) {
    for (const [titulo, atendimento] of result.index) {
      if (!consolidated.has(titulo)) {
        consolidated.set(titulo, atendimento);
      } else {
        const existing = consolidated.get(titulo);
        if (existing !== atendimento) {
          throw new Error(
            `O titulo ${titulo} esta associado aos atendimentos ${existing} e ${atendimento} ` +
            'em planilhas diferentes. Corrija antes de continuar.'
          );
        }
      }
    }
    if (result.warnings) warnings.push(...result.warnings);
  }

  return { index: consolidated, warnings, pairs: consolidated.size };
}

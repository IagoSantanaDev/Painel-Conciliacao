import { isPdfFile, getFileExt } from '../utils/fileExt.js';
import { parseBiMv } from '../parsers/biMvParser.js';
import { parseCielo } from '../parsers/cieloParser.js';
import { parseTasyPdf } from '../parsers/pdfTasyParser.js';
import { parseAtendimento, consolidateAtendimentoIndices } from '../parsers/atendimentoParser.js';
import { emptyParseResult } from '../utils/dedupe.js';

export async function parseHospitalFile(file) {
  return isPdfFile(file) ? parseTasyPdf(file) : parseBiMv(file);
}

export async function parseFilesSettled(files, parser, label) {
  const settled = await Promise.allSettled(files.map(parser));
  const results = [];
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      const name = files[i]?.name ?? `arquivo ${i + 1}`;
      const rawReason = s.reason?.message ?? String(s.reason ?? '');
      const reason = rawReason && rawReason !== 'undefined' && rawReason !== 'null'
        ? rawReason
        : 'erro desconhecido';
      errors.push(`Falha ao processar ${label.toLowerCase()} "${name}": ${reason}`);
    }
  }
  return { results, errors };
}

export async function parseHospitalFiles(files) {
  const pdfFiles = files.filter(isPdfFile);
  const sheetFiles = files.filter(f => !isPdfFile(f));

  if (!pdfFiles.length) {
    const { results, errors } = await parseFilesSettled(sheetFiles, parseBiMv, 'BI/MV');
    const merged = mergeParseResults(results, { source: results.length === 0 ? '' : 'BI_MV' });
    merged.warnings.unshift(...errors);
    return merged;
  }

  const atendimentoResults = [];
  const biMvCandidates = [];
  const warnings = [];

  for (const file of sheetFiles) {
    if (getFileExt(file) === 'xlsx') {
      try {
        const result = await parseAtendimento(file);
        atendimentoResults.push(result);
      } catch {
        biMvCandidates.push(file);
      }
    } else {
      biMvCandidates.push(file);
    }
  }

  const atendimentoIndex = atendimentoResults.length
    ? consolidateAtendimentoIndices(atendimentoResults)
    : { index: new Map(), warnings: [], pairs: 0 };

  if (!atendimentoResults.length) {
    warnings.push(
      'Nenhuma planilha de atendimento (colunas "Titulo" e "Atendimento") foi encontrada. ' +
      'Título e atendimento não serão vinculados automaticamente.'
    );
  }

  const [biMvParsed, pdfParsed] = await Promise.all([
    parseFilesSettled(biMvCandidates, parseBiMv, 'BI/MV'),
    parseFilesSettled(pdfFiles, parseTasyPdf, 'PDF Tasy'),
  ]);

  const allResults = [...pdfParsed.results, ...biMvParsed.results];
  const merged = mergeParseResults(allResults, { source: 'PDF_TASY' });
  merged.atendimentoIndex = atendimentoIndex;

  merged.warnings.unshift(...warnings, ...pdfParsed.errors, ...biMvParsed.errors);
  return merged;
}

export async function parseCieloFiles(files) {
  const { results, errors } = await parseFilesSettled(files, parseCielo, 'Cielo');
  const merged = mergeParseResults(results, { source: 'CIELO' });
  merged.warnings.unshift(...errors);
  return merged;
}

export function mergeParseResults(results, defaults = {}) {
  const allRows = results.flatMap(r => r.rows || []);
  const allWarnings = results.flatMap(r => r.warnings || []);
  const allIgnoredRows = results.reduce((sum, r) => sum + (r.ignoredRows || 0), 0);
  const allIgnoredLines = results.reduce((sum, r) => sum + (r.ignoredLines || 0), 0);
  const allPagesRead = results.reduce((sum, r) => sum + (r.pagesRead || 0), 0);
  return {
    ...emptyParseResult,
    ...defaults,
    rows: allRows,
    warnings: allWarnings,
    ignoredRows: allIgnoredRows,
    ignoredLines: allIgnoredLines,
    pagesRead: allPagesRead,
  };
}

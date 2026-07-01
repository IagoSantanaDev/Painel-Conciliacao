import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deduplicateByFields } from '../src/js/utils/dedupe.js';
import { isOkRow } from '../src/js/services/paymentPredicates.js';
import { reconcileRows } from '../src/js/services/reconciliation.js';
import { classifyExportSheet } from '../src/js/services/exportTd.js';
import { mergeParseResults } from '../src/js/services/parsePipeline.js';
import { parseMoneyBR, normalizeAuth } from '../src/js/utils/format.js';
import { isSpreadsheetFile, SPREADSHEET_EXTENSIONS, HOSPITAL_EXTENSIONS } from '../src/js/utils/fileExt.js';
import {
  STATUS_LABEL,
  SHEET_NAME,
  isCieloOnly,
  isCorrigido,
  containsBlockingKeyword,
  withCieloFallback,
} from '../src/js/services/paymentPredicates.js';
import { findHeaderRowByTokens, assertHeaderFound } from '../src/js/parsers/_shared.js';
import { emptyParseResult } from '../src/js/utils/dedupe.js';

describe('Smoke — contratos públicos', () => {
  it('utils/dedupe exporta deduplicateByFields', () => {
    assert.strictEqual(typeof deduplicateByFields, 'function');
  });

  it('utils/format exporta parseMoneyBR e normalizeAuth', () => {
    assert.strictEqual(typeof parseMoneyBR, 'function');
    assert.strictEqual(typeof normalizeAuth, 'function');
    assert.strictEqual(normalizeAuth('12345'), '12345');
    assert.strictEqual(parseMoneyBR('R$ 1,50'), 1.5);
  });

  it('utils/fileExt exporta constantes e isSpreadsheetFile', () => {
    assert.ok(SPREADSHEET_EXTENSIONS.includes('csv'));
    assert.ok(HOSPITAL_EXTENSIONS.includes('pdf'));
    assert.strictEqual(isSpreadsheetFile({ name: 'foo.xlsx' }), true);
    assert.strictEqual(isSpreadsheetFile({ name: 'foo.pdf' }), false);
  });

  it('services/paymentPredicates exporta STATUS_LABEL e predicados', () => {
    assert.strictEqual(STATUS_LABEL.CONCILIADO, 'Conciliado');
    assert.strictEqual(SHEET_NAME.CONCILIADOS, 'Conciliados');
    assert.strictEqual(isCieloOnly({ cieloOnly: true }), true);
    assert.strictEqual(isCorrigido({ corrigido: true }), true);
    assert.strictEqual(containsBlockingKeyword('Sem autorizador'), true);
    assert.strictEqual(withCieloFallback({ cielo: { foo: 1 }, bar: 2 }).foo, 1);
  });

  it('parsers/_shared exporta findHeaderRowByTokens e assertHeaderFound', () => {
    assert.strictEqual(typeof findHeaderRowByTokens, 'function');
    const idx = findHeaderRowByTokens(
      [['lixo'], ['lote', 'valor fatura']],
      [['lote'], ['valor fatura']],
    );
    assert.strictEqual(idx, 1);

    assert.throws(() => assertHeaderFound(-1, 'X'), /cabeçalho.*X/);
    assert.doesNotThrow(() => assertHeaderFound(0, 'X'));
  });

  it('utils/dedupe exporta emptyParseResult', () => {

    const empty = { ...emptyParseResult, source: 'X' };
    assert.deepStrictEqual(empty.rows, []);
    assert.strictEqual(empty.source, 'X');
  });

  it('services/reconciliation exporta isOkRow e reconcileRows', () => {
    assert.strictEqual(typeof isOkRow, 'function');
    assert.strictEqual(typeof reconcileRows, 'function');
    assert.strictEqual(isOkRow({ corrigido: true }), true);
  });

  it('services/exportTd exporta classifyExportSheet', () => {
    assert.strictEqual(typeof classifyExportSheet, 'function');
    assert.strictEqual(classifyExportSheet({ corrigido: true }), 'Conciliados');
    assert.strictEqual(classifyExportSheet({ cieloOnly: true }), 'Não encontrado');
  });

  it('services/parsePipeline exporta mergeParseResults', () => {
    assert.strictEqual(typeof mergeParseResults, 'function');
    const merged = mergeParseResults([{ rows: [{}], source: 'X' }]);
    assert.strictEqual(merged.rows.length, 1);
  });
});

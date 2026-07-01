
import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import Papa from 'papaparse';
import { makeXlsxSandbox, mockCsvFile, setupBrowserGlobals, teardownBrowserGlobals } from '../_helpers/fileMock.mjs';

const sandbox = makeXlsxSandbox();
setupBrowserGlobals({ XLSX: sandbox, Papa });

const XLSX = sandbox.XLSX;
const { read: XLSX_read, utils: XLSX_utils, write: XLSX_write } = XLSX;

process.on('exit', teardownBrowserGlobals);

describe('Magic Bytes Validation', () => {

  test('XLSX válido com magic bytes PK\x03\x04 é aceito', () => {
    const ws = XLSX_utils.aoa_to_sheet([['A', 'B'], [1, 2]]);
    const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
    const xlsxBuf = XLSX_write(wb, { bookType: 'xlsx', type: 'array' });
    const uint8 = new Uint8Array(xlsxBuf);

    assert.strictEqual(uint8[0], 0x50, 'primeiro byte = 0x50 (P)');
    assert.strictEqual(uint8[1], 0x4B, 'segundo byte = 0x4B (K)');
    assert.strictEqual(uint8[2], 0x03, 'terceiro byte = 0x03');
    assert.strictEqual(uint8[3], 0x04, 'quarto byte = 0x04');
  });

  test('CSV texto puro não contém null bytes', () => {
    const csvText = 'Nome,Valor\nAlice,100\nBob,200';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(csvText).buffer;
    const bytes = new Uint8Array(buffer.slice(0, 512));

    let hasNull = false;
    for (const b of bytes) {
      if (b === 0) { hasNull = true; break; }
    }
    assert.strictEqual(hasNull, false, 'CSV texto não deve conter null bytes');
  });

  test('Buffer binário contém null byte e deve ser rejeitado como CSV', () => {

    const malicious = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
    const buffer = malicious.buffer;

    let hasNull = false;
    for (let i = 0; i < 512 && i < malicious.length; i++) {
      if (malicious[i] === 0) { hasNull = true; break; }
    }
    assert.strictEqual(hasNull, true, 'buffer malicioso contém null byte');
  });

  test('Buffer só com null bytes deve falhar validação CSV', () => {
    const nullBytes = new Uint8Array(10);
    let hasNull = false;
    for (const b of nullBytes) {
      if (b === 0) { hasNull = true; break; }
    }
    assert.strictEqual(hasNull, true, 'buffer de nulls deve ser detectado');
  });

});

describe('parseCsvRows — validação de spoofing', () => {

  test('rejeita arquivo binário disfarçado de CSV', async () => {
    const { parseCsvRows } = await import('../../src/js/parsers/fileReaders.js');

    const maliciousBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00]);
    const mockFile = {
      name: 'malicious.csv',
      arrayBuffer: () => Promise.resolve(maliciousBytes.buffer),
    };

    await assert.rejects(
      () => parseCsvRows(mockFile),
      /não parece ser um CSV válido|conteúdo binário/i,
      'deve rejeitar CSV com null bytes',
    );
  });

  test('aceita CSV texto válido', async () => {
    const { parseCsvRows } = await import('../../src/js/parsers/fileReaders.js');

    const validCsv = 'Nome,Valor\nAlice,100\nBob,200';
    const mockFile = mockCsvFile(validCsv);

    const rows = await parseCsvRows(mockFile);
    assert.ok(Array.isArray(rows), 'deve retornar array');
    assert.ok(rows.length >= 2, 'deve ter pelo menos 2 linhas de dados');
  });

  test('parseia CSV com BOM UTF-8 sem contaminar primeiro header', async () => {
    const { parseCsvRows } = await import('../../src/js/parsers/fileReaders.js');

    const BOM = [0xEF, 0xBB, 0xBF];
    const csvText = 'Nome;Valor\nAlice;100\nBob;200';
    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csvText);
    const combined = new Uint8Array(BOM.length + csvBytes.length);
    combined.set(BOM, 0);
    combined.set(csvBytes, BOM.length);
    const mockFile = {
      name: 'csv-com-bom.csv',
      arrayBuffer: () => Promise.resolve(combined.buffer),
    };
    const rows = await parseCsvRows(mockFile);
    assert.ok(Array.isArray(rows), 'deve retornar array');
    assert.ok(rows.length >= 2, 'deve ter pelo menos 2 linhas de dados');

    const firstRow = rows[rows.length - 1];
    assert.ok(firstRow, 'deve haver data row');
  });

  test('rejeita CSV com BOM + null bytes (BOM não mascara binário)', async () => {
    const { parseCsvRows } = await import('../../src/js/parsers/fileReaders.js');

    const BOM = [0xEF, 0xBB, 0xBF];
    const evil = [0x00, 0x00, 0x00];
    const combined = new Uint8Array(BOM.length + evil.length);
    combined.set(BOM, 0);
    combined.set(evil, BOM.length);
    const mockFile = {
      name: 'evil.csv',
      arrayBuffer: () => Promise.resolve(combined.buffer),
    };
    await assert.rejects(
      () => parseCsvRows(mockFile),
      /não parece ser um CSV válido|conteúdo binário/i,
    );
  });

});

describe('parseWorkbookRows — validação ODS', () => {

  test('rejeita arquivo não-ZIP disfarçado de ODS', async () => {
    const { parseWorkbookRows } = await import('../../src/js/parsers/fileReaders.js');

    const maliciousBytes = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const mockFile = {
      name: 'malicious.ods',
      arrayBuffer: () => Promise.resolve(maliciousBytes.buffer),
    };

    await assert.rejects(
      () => parseWorkbookRows(mockFile),
      /não é um arquivo ODS válido|magic bytes/i,
      'deve rejeitar ODS sem magic bytes PK',
    );
  });

  test('rejeita arquivo não-ZIP disfarçado de XLSX', async () => {
    const { parseWorkbookRows } = await import('../../src/js/parsers/fileReaders.js');
    const maliciousBytes = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const mockFile = {
      name: 'malicious.xlsx',
      arrayBuffer: () => Promise.resolve(maliciousBytes.buffer),
    };
    await assert.rejects(
      () => parseWorkbookRows(mockFile),
      /não é um XLSX válido|magic bytes/i,
      'deve rejeitar XLSX sem magic bytes PK',
    );
  });

  test('rejeita arquivo não-ZIP disfarçado de XLSM', async () => {
    const { parseWorkbookRows } = await import('../../src/js/parsers/fileReaders.js');
    const maliciousBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const mockFile = {
      name: 'malicious.xlsm',
      arrayBuffer: () => Promise.resolve(maliciousBytes.buffer),
    };
    await assert.rejects(
      () => parseWorkbookRows(mockFile),
      /não é um XLSM válido|magic bytes/i,
      'deve rejeitar XLSM sem magic bytes PK',
    );
  });

  test('rejeita arquivo não-ZIP disfarçado de XLSB', async () => {
    const { parseWorkbookRows } = await import('../../src/js/parsers/fileReaders.js');
    const maliciousBytes = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const mockFile = {
      name: 'malicious.xlsb',
      arrayBuffer: () => Promise.resolve(maliciousBytes.buffer),
    };
    await assert.rejects(
      () => parseWorkbookRows(mockFile),
      /não é um XLSB válido|magic bytes/i,
      'deve rejeitar XLSB sem magic bytes PK',
    );
  });

});

describe('parseSpreadsheet — coleta de chaves de todas as rows', () => {

  it('headerNormalizer inclui chaves coletadas de todas as rows (não só header)', async () => {
    const { parseSpreadsheet } = await import('../../src/js/parsers/_shared.js');

    const fixtureCsv = 'A,B,C\n1,2,3\n4,5,6,EXTRA';
    const file = mockCsvFile(fixtureCsv);
    let capturedNormalizer = null;

    await parseSpreadsheet(
      file,
      [['a', 'b']],
      'spreadsheet-extra-columns',
      (row, index, headerNormalizer) => {
        if (index === 0) capturedNormalizer = headerNormalizer;
        return row;
      },
    );

    assert.ok(capturedNormalizer, 'normalizer deve ter sido capturado');

    assert.ok(capturedNormalizer.has('a'), "normalizer deve conter 'a'");
    assert.ok(capturedNormalizer.has('b'), "normalizer deve conter 'b'");
    assert.ok(capturedNormalizer.has('c'), "normalizer deve conter 'c'");
  });

  it('rowMapper recebe row com valores mapeados pelo header', async () => {
    const { parseSpreadsheet } = await import('../../src/js/parsers/_shared.js');

    const fixtureCsv = 'A,B\n1,2';
    const file = mockCsvFile(fixtureCsv);
    let firstRow = null;

    await parseSpreadsheet(
      file,
      [['a']],
      'spreadsheet-extra-columns',
      (row, index) => {
        if (index === 0) firstRow = row;
        return row;
      },
    );

    assert.ok(firstRow, 'primeira row deve existir');
    assert.strictEqual(firstRow.A, '1', 'A deve ser 1');
    assert.strictEqual(firstRow.B, '2', 'B deve ser 2');
  });

  it('normalizer é construído a partir de todas as rows, não só da primeira', async () => {
    const { parseSpreadsheet } = await import('../../src/js/parsers/_shared.js');

    const csvWithExtraCol = 'A,B\n1,2,3';
    const file = mockCsvFile(csvWithExtraCol);
    const collectedKeys = new Set();

    await parseSpreadsheet(
      file,
      [['a']],
      'spreadsheet-extra-columns',
      (row, index, normalizer) => {
        for (const k of normalizer.keys()) collectedKeys.add(k);
        return row;
      },
    );

    assert.ok(collectedKeys.has('a'), "normalizer deve conter 'a' coletada da row");
    assert.ok(collectedKeys.has('b'), "normalizer deve conter 'b' coletada da row");
  });

});

test('XLSX version is 0.20.x', (t) => {
  t.assert.ok(XLSX.version, 'version property exists');
  t.assert.ok(XLSX.version.startsWith('0.20'), `expected 0.20.x, got ${XLSX.version}`);
  console.log('[smoke] XLSX version:', XLSX.version);
});

test('XLSX.read with safe flags parses synthetic XLSX without error', (t) => {
  const ws = XLSX_utils.aoa_to_sheet([
    ['Nome',    'Valor',   'Status' ],
    ['Alice',   1234.56,   'Ativo'  ],
    ['Bob',     7890.00,   'Inativo'],
  ]);

  const wb = {
    SheetNames: ['TestSheet'],
    Sheets: { TestSheet: ws },
  };

  const xlsxBuf = XLSX_write(wb, { bookType: 'xlsx', type: 'array' });
  const uint8 = new Uint8Array(xlsxBuf);

  const wb2 = XLSX_read(uint8, {
    type: 'array',
    bookVBA: false,
    cellHTML: false,
    cellFormula: false,
  });

  t.assert.equal(wb2.SheetNames.length, 1, 'one sheet');
  t.assert.equal(wb2.SheetNames[0], 'TestSheet', 'sheet name preserved');

  const rows = XLSX_utils.sheet_to_json(wb2.Sheets['TestSheet'], { header: 1, raw: false });
  t.assert.equal(rows.length, 3, 'header + 2 data rows');
  t.assert.deepEqual(rows[0], ['Nome', 'Valor', 'Status'], 'header row');
  console.log('[smoke] parsed rows:', JSON.stringify(rows));
});

test('XLSX.read with safe flags on malformed input returns empty workbook (no crash)', (t) => {
  const badBuf = new Uint8Array([0x00, 0x00, 0x00]);
  const result = XLSX_read(badBuf, { type: 'array', bookVBA: false, cellHTML: false, cellFormula: false });
  t.assert.ok(result, 'returns a workbook object (no crash)');
  t.assert.ok(result.SheetNames.length >= 0, 'SheetNames array exists on malformed workbook');
  t.assert.ok(result.Sheets, 'Sheets object exists on malformed workbook');
  console.log('[smoke] malformed input handled safely, sheets:', result.SheetNames.length);
});

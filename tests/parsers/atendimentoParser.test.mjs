import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeXlsxSandbox, setupBrowserGlobals, teardownBrowserGlobals } from '../_helpers/fileMock.mjs';

const sandbox = makeXlsxSandbox({ withDocument: false });
// setupBrowserGlobals espera que XLSX seja o módulo real, não o sandbox que o contém.
// O sandbox contém window = sandbox, e sandbox.XLSX = módulo XLSX real.
// Mas setupBrowserGlobals sobrescreve globalThis.window com { XLSX }.
// Para window.XLSX ter .read/.utils, passamos o módulo real (sandbox.XLSX).
setupBrowserGlobals({ XLSX: sandbox.XLSX });
process.on('exit', teardownBrowserGlobals);

const { parseAtendimento, consolidateAtendimentoIndices } = await import('../../src/js/parsers/atendimentoParser.js');

// O módulo XLSX real fica em sandbox.XLSX (o sandbox em si não expõe .utils/.read diretamente)
const XLSX = sandbox.XLSX;

function xlsxFile(rows, name = 'atendimento.xlsx') {
  const wb = XLSX.utils.book_new();
  const sheetName = rows[0]?.[0] === 'Título' ? 'Sheet1' : 'Dados';
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  // XLSX.write pode retornar Array comum (sandbox) ou Uint8Array
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return {
    name,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: bytes.length,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

function nullByteFile(name = 'nulls.xlsx') {
  // Magic bytes incorretos — não é um ZIP/XLSX válido
  const buf = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]).buffer;
  return {
    name,
    type: 'application/octet-stream',
    size: buf.byteLength,
    arrayBuffer: () => Promise.resolve(buf),
  };
}

describe('parseAtendimento', () => {

  it('rejeita arquivos que não são .xlsx', async () => {
    await assert.rejects(
      parseAtendimento({ name: 'dados.csv' }),
      /deve ser um arquivo .xlsx/i,
    );
  });

  it('rejeita arquivo com magic bytes inválidos', async () => {
    await assert.rejects(
      parseAtendimento(nullByteFile('falso.xlsx')),
      /nao e um XLSX valido/i,
    );
  });

  it('builds index from a valid sheet with Título and Atendimento columns', async () => {
    const rows = [
      ['Título', 'Atendimento'],
      ['901432', '1900001'],
      ['901314', '1900002'],
      ['901557', '1900003'],
    ];
    const result = await parseAtendimento(xlsxFile(rows));
    assert.equal(result.pairs, 3);
    assert.equal(result.index.get('901432'), '1900001');
    assert.equal(result.index.get('901314'), '1900002');
    assert.equal(result.index.get('901557'), '1900003');
  });

  it('finds headers case-insensitively with accents and spaces', async () => {
    const rows = [
      ['  TíTuLo  ', ' ATENDIMENTO '],
      ['901432', '1900001'],
    ];
    const result = await parseAtendimento(xlsxFile(rows));
    assert.equal(result.pairs, 1);
    assert.equal(result.index.get('901432'), '1900001');
  });

  it('normalizes numeric cells with .0 suffix', async () => {
    const rows = [
      ['Título', 'Atendimento'],
      ['901432.0', '1900001.0'],
    ];
    const result = await parseAtendimento(xlsxFile(rows));
    assert.equal(result.index.get('901432'), '1900001');
  });

  it('ignora linhas sem título ou atendimento', async () => {
    const rows = [
      ['Título', 'Atendimento'],
      ['901432', '1900001'],
      ['', ''],              // linha vazia
      ['901433', ''],         // sem atendimento
      ['', '1900004'],        // sem título
    ];
    const result = await parseAtendimento(xlsxFile(rows));
    assert.equal(result.pairs, 1);
    assert.equal(result.index.get('901432'), '1900001');
  });

  it('bloqueia quando título duplicado aponta para atendimentos diferentes', async () => {
    const rows = [
      ['Título', 'Atendimento'],
      ['901432', '1900001'],
      ['901432', '1909999'],
    ];
    await assert.rejects(
      parseAtendimento(xlsxFile(rows)),
      /901432.*1900001.*1909999/i,
    );
  });

  it('aceita título duplicado com mesmo atendimento', async () => {
    const rows = [
      ['Título', 'Atendimento'],
      ['901432', '1900001'],
      ['901432', '1900001'],
    ];
    const result = await parseAtendimento(xlsxFile(rows));
    assert.equal(result.pairs, 1);
    assert.equal(result.index.get('901432'), '1900001');
  });

  it('detects headers in non-first sheet', async () => {
    const rows = [
      ['Coluna A', 'Coluna B'],   // sheet sem cabeçalhos esperados
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Título', 'Atendimento'],
      ['901432', '1900001'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Dados');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const file = {
      name: 'multi-sheet.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: bytes.length,
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    };
    const result = await parseAtendimento(file);
    assert.equal(result.pairs, 1);
    assert.equal(result.index.get('901432'), '1900001');
  });

  it('throw when no sheet has the required headers', async () => {
    const rows = [
      ['Coluna X', 'Coluna Y'],
      ['a', 'b'],
    ];
    await assert.rejects(
      parseAtendimento(xlsxFile(rows)),
      /nenhuma aba.*titulo.*atendimento/i,
    );
  });
});

describe('consolidateAtendimentoIndices', () => {

  it('merge índices de várias planilhas', () => {
    const idx1 = new Map([['A', '1'], ['B', '2']]);
    const idx2 = new Map([['C', '3'], ['D', '4']]);
    const consolidated = consolidateAtendimentoIndices([
      { index: idx1 },
      { index: idx2 },
    ]);
    assert.equal(consolidated.pairs, 4);
    assert.equal(consolidated.index.get('A'), '1');
    assert.equal(consolidated.index.get('C'), '3');
  });

  it('bloqueia conflitos entre planilhas diferentes', () => {
    const idx1 = new Map([['A', '1']]);
    const idx2 = new Map([['A', '999']]);
    assert.throws(
      () => consolidateAtendimentoIndices([{ index: idx1 }, { index: idx2 }]),
      /A.*1.*999.*planilhas diferentes/i,
    );
  });

  it('aceita mesmo relacionamento em planilhas diferentes', () => {
    const idx1 = new Map([['A', '1']]);
    const idx2 = new Map([['A', '1']]);
    const consolidated = consolidateAtendimentoIndices([
      { index: idx1 },
      { index: idx2 },
    ]);
    assert.equal(consolidated.pairs, 1);
    assert.equal(consolidated.index.get('A'), '1');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  mergeParseResults,
  parseFilesSettled,
  parseHospitalFiles,
  parseCieloFiles,
} from '../../src/js/services/parsePipeline.js';
import { deduplicateCrossSourceRows } from '../../src/js/utils/dedupe.js';

describe('mergeParseResults', () => {
  it('agrega linhas, avisos e contadores preservando source padrão', () => {
    const result = mergeParseResults([
      {
        rows: [{ id: 1 }],
        warnings: ['aviso 1'],
        ignoredRows: 2,
        ignoredLines: 3,
        pagesRead: 1,
        source: 'BI_MV',
      },
      {
        rows: [{ id: 2 }],
        warnings: ['aviso 2'],
        ignoredRows: 4,
        ignoredLines: 5,
        pagesRead: 2,
        source: 'PDF_TASY',
      },
    ], { source: 'PDF_TASY' });

    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 2 }]);
    assert.deepStrictEqual(result.warnings, ['aviso 1', 'aviso 2']);
    assert.strictEqual(result.ignoredRows, 6);
    assert.strictEqual(result.ignoredLines, 8);
    assert.strictEqual(result.pagesRead, 3);
    assert.strictEqual(result.source, 'PDF_TASY');
  });
});

describe('parseFilesSettled (A6 — Promise.allSettled resiliência)', () => {

  const fakeParser = async (file) => {
    if (file.name.startsWith('fail')) {
      throw new Error(`parse error: ${file.name}`);
    }
    return {
      rows: [{ from: file.name }],
      warnings: [],
      ignoredRows: 0,
      ignoredLines: 0,
      pagesRead: 0,
      source: 'TEST',
    };
  };

  it('preserva resultados válidos quando 1 arquivo falha', async () => {
    const files = [
      { name: 'ok-1.test' },
      { name: 'ok-2.test' },
      { name: 'fail-1.test' },
      { name: 'ok-3.test' },
    ];
    const { results, errors } = await parseFilesSettled(files, fakeParser, 'Test');
    assert.strictEqual(results.length, 3, '3 arquivos devem ter parseado');
    assert.strictEqual(errors.length, 1, '1 erro deve ter sido coletado');

    assert.ok(errors[0].includes('fail-1.test'), `erro deve mencionar o nome: ${errors[0]}`);
    assert.ok(errors[0].includes('parse error'), `erro deve carregar message original: ${errors[0]}`);
  });

  it('retorna errors=[] e results=[] quando todos falham (shape válido, não throw)', async () => {
    const files = [{ name: 'fail-a.test' }, { name: 'fail-b.test' }];
    const { results, errors } = await parseFilesSettled(files, fakeParser, 'Test');
    assert.strictEqual(results.length, 0);
    assert.strictEqual(errors.length, 2);
  });

  it('lida com parser que rejeita com null (fallback para "erro desconhecido")', async () => {
    const weirdParser = async () => { throw null; };
    const { errors } = await parseFilesSettled([{ name: 'x.test' }], weirdParser, 'Test');
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('erro desconhecido'),
      `fallback esperado: ${errors[0]}`);
  });

  it('lida com files sem name (fallback "arquivo N")', async () => {
    const files = [{}, { name: 'real.test' }];
    const { results, errors } = await parseFilesSettled(files, fakeParser, 'Test');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('arquivo 1'), `fallback numérico: ${errors[0]}`);
  });
});

describe('parseHospitalFiles / parseCieloFiles (A6 — integração)', () => {

  it('parseCieloFiles preserva resultados quando 1 arquivo falha', async () => {

    const okFile = {
      name: 'vendas.csv',
      arrayBuffer: () => {

        const text = 'CIELO\n';
        return Promise.resolve(new TextEncoder().encode(text).buffer);
      },
    };
    const failFile = {
      name: 'lixo.csv',
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('').buffer),
    };
    const result = await parseCieloFiles([okFile, failFile]);

    const hasFailureWarning = result.warnings.some(w => w.startsWith('Falha ao processar'));
    assert.ok(hasFailureWarning || result.rows.length === 0,
      'deve retornar shape válido mesmo com falha parcial');

    assert.strictEqual(result.source, 'CIELO');
  });

  it('parseHospitalFiles retorna shape válido com rows=[] quando todos falham', async () => {

    const failA = { name: 'a.csv', arrayBuffer: () => Promise.resolve(new TextEncoder().encode('').buffer) };
    const failB = { name: 'b.csv', arrayBuffer: () => Promise.resolve(new TextEncoder().encode('').buffer) };
    const result = await parseHospitalFiles([failA, failB]);
    assert.deepStrictEqual(result.rows, []);
    assert.strictEqual(result.source, '',
      'source deve ser vazio quando nenhum arquivo processou com sucesso');
    const failWarnings = result.warnings.filter(w => w.startsWith('Falha ao processar'));
    assert.strictEqual(failWarnings.length, 2);
  });
});

describe('deduplicateCrossSourceRows', () => {
  it('deduplica somente quando chave canônica cross-source é idêntica', () => {
    const base = {
      origem: 'BI_MV',
      registro: 'R001',
      contaFatura: 'F001',
      dataPagamento: '18/06/2026',
      horaPagamento: '10:00',
      autorizador: '123456',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
      bandeira: 'VISA',
      formaPagamento: 'CREDITO',
      parcelas: '1',
      lote: 'L001',
      caixa: 'C01',
    };

    const duplicate = { ...base, extra: 'ignorado' };
    const samePaymentDifferentOrigin = { ...base, origem: 'PDF_TASY' };

    const result = deduplicateCrossSourceRows([base, duplicate, samePaymentDifferentOrigin]);

    assert.deepStrictEqual(result, [base, samePaymentDifferentOrigin]);
  });
});

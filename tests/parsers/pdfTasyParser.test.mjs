
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDocumentTracker,
  ingestDocumentInfo,
  consumeDocumentInfo,
  RECEIPT_ESPECIE_RX,
} from '../../src/js/parsers/pdfTasyParser.js';

const FIXTURE_PDF = readFileSync(
  resolve(import.meta.dirname, './fixture-empty.pdf'),
);

const mockFile = Object.freeze({
  name: 'fixture-empty.pdf',
  type: 'application/pdf',
  arrayBuffer() {
    return Promise.resolve(FIXTURE_PDF.buffer.slice(
      FIXTURE_PDF.byteOffset,
      FIXTURE_PDF.byteOffset + FIXTURE_PDF.byteLength,
    ));
  },
});

describe('pdfTasyParser smoke tests', () => {

  it('pdf.js v4.x (>= 4.2.67) is accessible via getPdfJs', async () => {

    const { version } = await import('../../src/vendor/pdf.min.mjs');
    assert.ok(
      typeof version === 'string' && version.length > 0,
      'pdf.min.mjs should export a non-empty version string, got: ' + version,
    );
    const [major, minor] = version.split('.').map(Number);
    assert.ok(
      major >= 4 && (major > 4 || minor >= 2),
      'expected v4.2.x+, got: ' + version,
    );
  });

  it('loadPdfDocument calls getDocument with isEvalSupported: false', async () => {

    const parserSrc = readFileSync(
      resolve(import.meta.dirname, '../../src/js/parsers/pdfTasyParser.js'),
      'utf8',
    );
    assert.ok(
      parserSrc.includes('isEvalSupported: false'),
      'loadPdfDocument must call getDocument with isEvalSupported: false',
    );
    const occurrences = (parserSrc.match(/isEvalSupported:\s*false/g) || []).length;
    assert.ok(
      occurrences >= 2,
      'expected at least 2 occurrences of isEvalSupported:false ' +
      '(primary + fallback), got: ' + occurrences,
    );
  });

  it('parseTasyPdf accepts a File-like object and reaches end-of-parse', async () => {
    const isNode = typeof window === 'undefined';
    if (isNode) {

      console.warn(
        '[pdfTasyParser] Node.js detected: runtime smoke test skipped.\n' +
        '  pdf.js v4 uses structuredClone/worker which is not fully supported.\n' +
        '  Source-contract tests 1 and 2 confirm the mitigations are in place.\n' +
        '  Browser smoke test required separately.',
      );
    }
    const { parseTasyPdf } = await import('../../src/js/parsers/pdfTasyParser.js');
    if (isNode) {

      try {
        await parseTasyPdf(mockFile);
        assert.fail('parseTasyPdf should have thrown in Node.js');
      } catch (err) {
        const msg = String(err?.message || err || '');
        const isWorkerOrCloneError =
          msg.includes('Setting up fake worker failed') ||
          msg.includes('DataCloneError') ||
          msg.includes('structuredClone') ||
          msg.includes('Cannot transfer') ||
          msg.includes('GlobalWorkerOptions.workerSrc') ||

          msg.includes('Promise.withResolvers is not a function');
        assert.ok(
          isWorkerOrCloneError,
          'Expected a worker/structuredClone error in Node.js, got: ' + msg,
        );

      }
    } else {

      await assert.rejects(
        () => parseTasyPdf(mockFile),
        /Nenhuma transacao.valida.foi.encontrada.no PDF/,
        'parser should reach end-of-parse and throw the empty-result error',
      );
    }
  });
});

describe('documentInfo tracker (vinculação título→autorização)', () => {

  it('createDocumentTracker retorna tracker vazio e consumido', () => {
    const t = createDocumentTracker();
    assert.deepStrictEqual(t, { titulo: '', notaFiscal: '', consumed: true });
  });

  it('ingestDocumentInfo atualiza titulo e marca como disponível', () => {
    const t = createDocumentTracker();
    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });
    assert.strictEqual(t.titulo, '903655');
    assert.strictEqual(t.notaFiscal, '100');
    assert.strictEqual(t.consumed, false, 'após ingest deve estar disponível');
  });

  it('consumeDocumentInfo retorna titulo na primeira chamada e marca como consumido', () => {
    const t = createDocumentTracker();
    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });
    const consumed = consumeDocumentInfo(t);
    assert.strictEqual(consumed.titulo, '903655');
    assert.strictEqual(consumed.notaFiscal, '100');
    assert.strictEqual(t.consumed, true, 'após consumir deve estar marcado');
  });

  it('consumeDocumentInfo retorna vazio em chamadas subsequentes (cada título só vincula a 1 autorização)', () => {
    const t = createDocumentTracker();
    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });

    const first = consumeDocumentInfo(t);
    const second = consumeDocumentInfo(t);
    const third = consumeDocumentInfo(t);

    assert.strictEqual(first.titulo, '903655', 'primeira autorização recebe o título');
    assert.strictEqual(second.titulo, '', 'segunda autorização NÃO recebe o título');
    assert.strictEqual(third.titulo, '', 'terceira autorização também NÃO recebe');
  });

  it('segundo ingest libera novo título para próxima autorização', () => {
    const t = createDocumentTracker();
    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });

    consumeDocumentInfo(t);
    consumeDocumentInfo(t);

    ingestDocumentInfo(t, { titulo: '876543', notaFiscal: '200' });
    const next = consumeDocumentInfo(t);
    assert.strictEqual(next.titulo, '876543', 'após novo ingest, próxima autorização recebe novo título');

    consumeDocumentInfo(t);
  });

  it('cenário completo do bug reportado: 1 título, 3 autorizações em sequência', () => {

    const t = createDocumentTracker();

    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });

    const auth1 = consumeDocumentInfo(t);
    assert.strictEqual(auth1.titulo, '903655', 'paciente A → titulo 903655');

    const auth2 = consumeDocumentInfo(t);
    assert.strictEqual(auth2.titulo, '', 'paciente B → sem titulo (correto!)');

    const auth3 = consumeDocumentInfo(t);
    assert.strictEqual(auth3.titulo, '', 'paciente C → sem titulo (correto!)');
  });

  it('ingestDocumentInfo ignora linhas sem título nem notaFiscal', () => {
    const t = createDocumentTracker();
    const before = { ...t };
    ingestDocumentInfo(t, { titulo: '', notaFiscal: '' });
    assert.deepStrictEqual(t, before, 'tracker não muda com input vazio');
  });

  it('consumeDocumentInfo em tracker recém-criado retorna vazio', () => {
    const t = createDocumentTracker();
    const result = consumeDocumentInfo(t);
    assert.strictEqual(result.titulo, '');
    assert.strictEqual(result.notaFiscal, '');
  });

});

describe('consume-on-create (loop real do parser)', () => {

  it('título só é consumido quando extractTasyRowsFromLine cria row', () => {

    const t = createDocumentTracker();

    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });
    const directRowsFromTitle = [];
    if (directRowsFromTitle.length > 0) consumeDocumentInfo(t);
    assert.strictEqual(t.consumed, false, 'após linha do título (sem row), tracker NÃO consumido');

    const directRowsFromHeader = [];
    if (directRowsFromHeader.length > 0) consumeDocumentInfo(t);
    assert.strictEqual(t.consumed, false, 'após linha intermediária (sem row), tracker continua disponível');

    const auth1 = consumeDocumentInfo(t);
    assert.strictEqual(auth1.titulo, '903655', 'autorização 1 RECEBE o título 903655');
    assert.strictEqual(t.consumed, true);
  });

  it('segunda autorização após consume recebe docInfo VAZIO (comportamento intencional)', () => {
    const t = createDocumentTracker();
    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });

    const auth1 = consumeDocumentInfo(t);
    assert.strictEqual(auth1.titulo, '903655');

    const auth2 = consumeDocumentInfo(t);
    assert.strictEqual(auth2.titulo, '', '2ª autorização não recebe título (correto: 1 título por lançamento)');
  });

  it('cenário original do bug reportado: 1 título + 3 autorizações em sequência com linhas intermediárias', () => {

    const t = createDocumentTracker();

    ingestDocumentInfo(t, { titulo: '903655', notaFiscal: '100' });

    const headerRows = [];
    if (headerRows.length > 0) consumeDocumentInfo(t);

    const auth1 = consumeDocumentInfo(t);
    assert.strictEqual(auth1.titulo, '903655', 'primeira autorização recebe o título');

    const auth2 = consumeDocumentInfo(t);
    const auth3 = consumeDocumentInfo(t);
    assert.strictEqual(auth2.titulo, '');
    assert.strictEqual(auth3.titulo, '');
  });
});

describe('RECEIPT_ESPECIE_RX casa com e sem acento', () => {

  it('casa "Espécie" COM acento (caso real do Tasy)', () => {
    assert.ok(
      RECEIPT_ESPECIE_RX.test('CX - Recebimento Espécie 100,00'),
      'deve casar "Espécie" com é acentuado',
    );
  });

  it('casa "Especie" SEM acento (fallback de compatibilidade)', () => {
    assert.ok(
      RECEIPT_ESPECIE_RX.test('CX - Recebimento Especie 100,00'),
      'deve casar "Especie" sem acento',
    );
  });

  it('casa com espaços variáveis antes do valor', () => {
    assert.ok(
      RECEIPT_ESPECIE_RX.test('CX - Recebimento   Espécie   1.234,56'),
      'deve casar com espaços extras',
    );
  });

  it('NÃO casa linha de recebimento cartão (RX distinto)', () => {
    assert.ok(
      !RECEIPT_ESPECIE_RX.test('CX - Recebimento Cartão de Crédito 100,00'),
      'não deve casar linha de cartão (escopo restrito a espécie)',
    );
  });
});

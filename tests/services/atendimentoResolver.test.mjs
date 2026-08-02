import { describe, it } from 'node:test';
import assert from 'node:assert';

const { resolveAtendimento } = await import('../../src/js/services/atendimentoResolver.js');

describe('resolveAtendimento', () => {

  it('returns rows unchanged when no atendimentoIndex is provided', () => {
    const rows = [
      { id: 1, tituloTasy: '901432', atendimento: '', registro: '901432' },
    ];
    const result = resolveAtendimento(rows, null);
    assert.deepStrictEqual(result, { rows, warnings: [] });
  });

  it('returns rows unchanged when atendimentoIndex has no index', () => {
    const rows = [
      { id: 1, tituloTasy: '901432' },
    ];
    const result = resolveAtendimento(rows, {});
    assert.deepStrictEqual(result, { rows, warnings: [] });
  });

  it('resolves tituloTasy to atendimento', () => {
    const index = new Map([['901432', '1900001']]);
    const rows = [
      { id: 1, tituloTasy: '901432', atendimento: '', registro: '901432' },
    ];
    const result = resolveAtendimento(rows, { index });
    assert.equal(result.rows[0].atendimento, '1900001');
    assert.equal(result.rows[0].atendimentoResolvido, true);
  });

  it('falls back to título when not found in index', () => {
    const index = new Map([['901432', '1900001']]);
    const rows = [
      { id: 1, tituloTasy: '999999', atendimento: '', registro: '999999' },
    ];
    const result = resolveAtendimento(rows, { index });
    assert.equal(result.rows[0].atendimento, '999999');
    assert.equal(result.rows[0].atendimentoResolvido, false);
  });

  it('does not touch rows without tituloTasy (adiantamentos)', () => {
    const index = new Map([['901432', '1900001']]);
    const rows = [
      { id: 1, tituloTasy: '', atendimento: '', registro: '' },
    ];
    const result = resolveAtendimento(rows, { index });
    assert.equal(result.rows[0].atendimento, '');
    assert.equal(result.rows[0].atendimentoResolvido, undefined);
  });

  it('resolves multiple rows from the same título', () => {
    const index = new Map([['901432', '1900001']]);
    const rows = [
      { id: 1, tituloTasy: '901432', autorizador: 'A1', valorCartao: 100 },
      { id: 2, tituloTasy: '901432', autorizador: 'A2', valorCartao: 50 },
    ];
    const result = resolveAtendimento(rows, { index });
    assert.equal(result.rows[0].atendimento, '1900001');
    assert.equal(result.rows[1].atendimento, '1900001');
    assert.equal(result.rows[0].atendimentoResolvido, true);
    assert.equal(result.rows[1].atendimentoResolvido, true);
  });

  it('reports warnings for unfound titles', () => {
    const index = new Map([['901432', '1900001']]);
    const rows = [
      { id: 1, tituloTasy: '999999', registro: '999999' },
    ];
    const result = resolveAtendimento(rows, { index });
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('nao encontrado'));
  });

  it('does not report warnings when index is empty', () => {
    const rows = [
      { id: 1, tituloTasy: '', registro: '' },
    ];
    const result = resolveAtendimento(rows, { index: new Map() });
    assert.equal(result.warnings.length, 0);
  });
});

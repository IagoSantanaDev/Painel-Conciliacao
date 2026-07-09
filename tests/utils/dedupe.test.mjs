import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deduplicateByFields, findDuplicateAutorizadores } from '../../src/js/utils/dedupe.js';

describe('deduplicateByFields', () => {
  it('remove duplicatas por chave composta preservando primeira ocorrência', () => {
    const first = { id: 'first', auth: '123456', amount: 100, source: 'BI_MV' };
    const duplicate = { id: 'duplicate', auth: '123456', amount: 100, source: 'BI_MV' };
    const distinct = { id: 'distinct', auth: '123456', amount: 200, source: 'BI_MV' };

    const result = deduplicateByFields([first, duplicate, distinct], ['auth', 'amount', 'source']);

    assert.deepStrictEqual(result, [first, distinct]);
  });

  it('trata campos ausentes como parte da chave composta', () => {
    const rows = [
      { id: 1, auth: '123456' },
      { id: 2, auth: '123456' },
      { id: 3, auth: '654321' },
    ];

    const result = deduplicateByFields(rows, ['auth', 'missingField']);

    assert.deepStrictEqual(result.map(row => row.id), [1, 3]);
  });
});

describe('findDuplicateAutorizadores', () => {
  it('retorna Set vazio quando nenhum autorizador é duplicado', () => {
    const rows = [
      { autorizador: 'A1' },
      { autorizador: 'A2' },
      { autorizador: 'A3' },
    ];
    assert.deepStrictEqual([...findDuplicateAutorizadores(rows)], []);
  });

  it('detecta autorizadores que aparecem 2+ vezes', () => {
    const rows = [
      { autorizador: 'A1' },
      { autorizador: 'A1' },
      { autorizador: 'A2' },
      { autorizador: 'A3' },
      { autorizador: 'A3' },
    ];
    assert.deepStrictEqual([...findDuplicateAutorizadores(rows)].sort(), ['A1', 'A3']);
  });

  it('ignora rows sem autorizador', () => {
    const rows = [
      { autorizador: '' },
      { autorizador: null },
      { autorizador: undefined },
      { autorizador: 'B1' },
    ];
    assert.deepStrictEqual([...findDuplicateAutorizadores(rows)], []);
  });

  it('BUGFIX: ignora rows Cielo-only — não inflarem o set com autorizadores exclusivos do Cielo', () => {
    const rows = [
      { autorizador: 'A1' },
      { autorizador: 'B2', cieloOnly: true },
      { autorizador: 'B2', cieloOnly: true },
      { autorizador: 'C3' },
    ];
    // B2 só aparece 2x em rows Cielo-only. Não deve ser marcado como duplicado,
    // pois a duplicação entre Cielo rows não aciona `allowReuse` em rows hospitalares.
    assert.deepStrictEqual([...findDuplicateAutorizadores(rows)], []);
  });

  it('BUGFIX: rows Cielo-only com autorizador vazio não geram falso positivo', () => {
    const rows = [
      { autorizador: 'A1' },
      { autorizador: '—', cieloOnly: true },
      { autorizador: '—', cieloOnly: true },
    ];
    assert.deepStrictEqual([...findDuplicateAutorizadores(rows)], []);
  });
});

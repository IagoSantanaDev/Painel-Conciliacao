import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deduplicateHospitalRows, findDuplicateAutorizadores } from '../../src/js/utils/dedupe.js';
import { createHospitalRow, createCieloRow } from '../_helpers/fileMock.mjs';

let buildCieloIndexWithDedup;
try {
  ({ buildCieloIndexWithDedup } = await import('../../src/js/services/reconciliation.js'));
} catch (_) {

}

describe('deduplicateHospitalRows', () => {

  it('preserva duas linhas com mesmo autorizador/valor mas registro diferente', () => {
    const rows = [
      createHospitalRow({ registro: '0001', contaFatura: 'FAT-001' }),
      createHospitalRow({ registro: '0002', contaFatura: 'FAT-002' }),
    ];

    const result = deduplicateHospitalRows(rows);

    assert.strictEqual(result.length, 2, 'Ambas as linhas devem ser preservadas');
  });

  it('preserva duas linhas com mesmo autorizador/valor mas contaFatura diferente', () => {
    const rows = [
      createHospitalRow({ registro: '0001', contaFatura: 'FAT-001' }),
      createHospitalRow({ registro: '0001', contaFatura: 'FAT-002' }),
    ];

    const result = deduplicateHospitalRows(rows);

    assert.strictEqual(result.length, 2, 'Ambas as linhas devem ser preservadas');
  });

  it('preserva duas linhas com mesma origem mas campos-identidade diferentes', () => {
    const rows = [
      createHospitalRow({ origem: 'BI_MV', registro: 'R001', contaFatura: 'F001', dataPagamento: '18/06/2026', horaPagamento: '09:00:00' }),
      createHospitalRow({ origem: 'PDF_TASY', registro: 'R002', contaFatura: 'F002', dataPagamento: '19/06/2026', horaPagamento: '14:00:00' }),
    ];

    const result = deduplicateHospitalRows(rows);

    assert.strictEqual(result.length, 2, 'Linhas de origens diferentes devem ser preservadas');
  });

  it('deduplica linhas identicas', () => {
    const duplicate = createHospitalRow({ registro: '0001', contaFatura: 'FAT-001' });
    const rows = [duplicate, { ...duplicate }];

    const result = deduplicateHospitalRows(rows);

    assert.strictEqual(result.length, 1, 'Linha duplicada deve ser removida');
  });

  it('deduplica mesma linha vinda de BI_MV e PDF_TASY com todos campos iguais', () => {
    const base = {
      autorizador: '123456',
      valorCartao: 100.00,
      valorDinheiro: 0,
      valorFatura: 100.00,
      bandeira: 'VISA',
      formaPagamento: 'CREDITO',
      parcelas: '1',
      lote: 'L001',
      caixa: 'C01',
    };
    const rows = [
      createHospitalRow({ ...base, origem: 'BI_MV', registro: 'R001', contaFatura: 'F001', dataPagamento: '18/06/2026', horaPagamento: '09:00:00' }),
      createHospitalRow({ ...base, origem: 'PDF_TASY', registro: 'R001', contaFatura: 'F001', dataPagamento: '18/06/2026', horaPagamento: '09:00:00' }),
    ];

    const result = deduplicateHospitalRows(rows);

    assert.strictEqual(result.length, 1, 'Mesma linha de BI_MV e PDF_TASY deve ser deduplicada');
  });

});

describe('findDuplicateAutorizadores', () => {

  it('retorna Set vazio quando não há duplicatas', () => {
    const rows = [
      createHospitalRow({ autorizador: 'AUTH001' }),
      createHospitalRow({ autorizador: 'AUTH002' }),
      createHospitalRow({ autorizador: 'AUTH003' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.ok(result instanceof Set, 'deve retornar um Set');
    assert.strictEqual(result.size, 0, 'não deve haver duplicatas');
  });

  it('detecta autorizador que aparece em duas linhas com registros diferentes', () => {

    const rows = [
      createHospitalRow({ registro: 'REG001', autorizador: '11111' }),
      createHospitalRow({ registro: 'REG002', autorizador: '11111' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.ok(result.has('11111'), 'AUTH 11111 deve estar marcado como duplicado');
    assert.strictEqual(result.size, 1, 'apenas 1 autorizador duplicado');
  });

  it('detecta múltiplos autorizadores duplicados simultaneamente', () => {
    const rows = [
      createHospitalRow({ registro: 'REG001', autorizador: '11111' }),
      createHospitalRow({ registro: 'REG002', autorizador: '11111' }),
      createHospitalRow({ registro: 'REG003', autorizador: '22222' }),
      createHospitalRow({ registro: 'REG004', autorizador: '22222' }),
      createHospitalRow({ registro: 'REG005', autorizador: '33333' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.strictEqual(result.size, 2, 'deve detectar 2 autorizadores duplicados');
    assert.ok(result.has('11111'), 'AUTH 11111 deve estar duplicado');
    assert.ok(result.has('22222'), 'AUTH 22222 deve estar duplicado');
    assert.ok(!result.has('33333'), 'AUTH 33333 não está duplicado');
  });

  it('ignora linhas com autorizador vazio', () => {
    const rows = [
      createHospitalRow({ autorizador: '' }),
      createHospitalRow({ autorizador: '' }),
      createHospitalRow({ autorizador: null }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.strictEqual(result.size, 0, 'autorizadores vazios não contam como duplicata');
  });

  it('trata autorizador com espaços extras via trim', () => {
    const rows = [
      createHospitalRow({ autorizador: '  AUTH001  ' }),
      createHospitalRow({ autorizador: 'AUTH001' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.strictEqual(result.size, 1, 'espaços não devem impedir a detecção');
    assert.ok(result.has('AUTH001'), 'AUTH001 deve ser detectado após trim');
  });

  it('retorna Set vazio para array vazio', () => {
    const result = findDuplicateAutorizadores([]);
    assert.strictEqual(result.size, 0);
  });

  it('não falha com rows null/undefined', () => {
    const rows = [
      createHospitalRow({ autorizador: 'AUTH001' }),
      null,
      undefined,
      createHospitalRow({ autorizador: 'AUTH001' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.ok(result.has('AUTH001'), 'AUTH001 deve ser detectado mesmo com rows null');
  });

  it('não conta duas ocorrências de um mesmo auth no MESMO registro como duplicata', () => {

    const rows = [
      createHospitalRow({ registro: 'REG001', autorizador: '11111' }),
      createHospitalRow({ registro: 'REG001', autorizador: '11111' }),
    ];

    const result = findDuplicateAutorizadores(rows);

    assert.strictEqual(result.size, 1);
    assert.ok(result.has('11111'));
  });

});

if (typeof buildCieloIndexWithDedup !== 'undefined') {
  describe('buildCieloIndexWithDedup — stats de dedup', () => {

    it('retorna objeto com stats.duplicatesRemoved quando há duplicatas', () => {
      const base = { autorizador: 'AUTH001', valorBruto: 100, dataVenda: '2024-01-15', nsu: 'NSU001' };
      const rows = [
        createCieloRow({ idInterno: 'C1', ...base }),
        createCieloRow({ idInterno: 'C2', ...base }),
        createCieloRow({ idInterno: 'C3', autorizador: 'AUTH002', valorBruto: 200, dataVenda: '2024-01-16', nsu: 'NSU002' }),
      ];

      const result = buildCieloIndexWithDedup(rows);

      assert.ok(
        typeof result === 'object' && result !== null && !Array.isArray(result),
        'buildCieloIndexWithDedup deve retornar um objeto, não diretamente o Map',
      );
      assert.ok(
        'duplicatesRemoved' in result,
        'buildCieloIndexWithDedup deve expor a propriedade "duplicatesRemoved"',
      );
      assert.strictEqual(
        typeof result.duplicatesRemoved,
        'number',
        'duplicatesRemoved deve ser um número',
      );
      assert.strictEqual(
        result.duplicatesRemoved,
        1,
        'Com 3 linhas e 1 duplicata, duplicatesRemoved deve ser 1',
      );
    });

    it('retorna duplicatesRemoved = 0 quando não há duplicatas', () => {
      const rows = [
        createCieloRow({ idInterno: 'C1', autorizador: 'AUTH001', valorBruto: 100, dataVenda: '2024-01-15', nsu: 'NSU001' }),
        createCieloRow({ idInterno: 'C2', autorizador: 'AUTH002', valorBruto: 200, dataVenda: '2024-01-16', nsu: 'NSU002' }),
      ];

      const result = buildCieloIndexWithDedup(rows);

      assert.ok(
        typeof result === 'object' && result !== null && !Array.isArray(result),
        'buildCieloIndexWithDedup deve retornar um objeto',
      );
      assert.strictEqual(result.duplicatesRemoved, 0, 'Sem duplicatas, duplicatesRemoved deve ser 0');
    });

    it('retorna index.get(authKey) como Map após dedup', () => {
      const rows = [
        createCieloRow({ idInterno: 'C1', autorizador: 'AUTH001', valorBruto: 100, dataVenda: '2024-01-15', nsu: 'NSU001' }),
        createCieloRow({ idInterno: 'C2', autorizador: 'AUTH001', valorBruto: 100, dataVenda: '2024-01-15', nsu: 'NSU001' }),
      ];

      const result = buildCieloIndexWithDedup(rows);

      assert.ok(result.index instanceof Map, 'result.index deve ser um Map');
      assert.strictEqual(result.index.size, 1, 'Index deve conter apenas 1 chave após dedup');
    });

  });
}

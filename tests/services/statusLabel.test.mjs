import { describe, it, before } from 'node:test';
import assert from 'node:assert';

let reconciliation;

before(async () => {
  const mod = await import('../../src/js/services/reconciliation.js');
  reconciliation = mod;
});

describe('getStatusLabel via reconcileOne', () => {

  it('hospital row sem match Cielo → statusLabel "Não encontrado"', () => {

    const hospitalRow = {
      id: 1,
      registro: 'R001',
      caixa: 'C1',
      lote: 'L001',
      autorizador: 'A00000',
      valorCartao: 50.00,
      valorDinheiro: 0,
      valorFatura: 0,
      desconto: 0,
      bandeira: 'VISA',
      formaPagamento: 'Crédito',
      parcelas: '1',
      numeroMaquina: 'MAQ001',
      corrigido: false,
    };

    const cieloIndex = reconciliation.buildCieloIndexWithDedup([
      { idInterno: 'CI-OTHER', autorizador: 'A99999', valorBruto: 50.00 },
    ]).index;

    const matchedCieloIds = new Set();
    const result = reconciliation.reconcileOne(hospitalRow, cieloIndex, matchedCieloIds);

    assert.ok(
      result.status.some(s => s.includes('Não encontrado')),
      `Deveria ter status contendo 'Não encontrado', mas tinha: ${JSON.stringify(result.status)}`
    );
    assert.strictEqual(
      result.statusLabel,
      'Não encontrado',
      `statusLabel deveria ser 'Não encontrado', mas era: '${result.statusLabel}'`
    );
  });

  it('reconcileRows: linha Cielo-only usa statusLabel "Não encontrado"', () => {

    const hospitalRows = [
      {
        id: 1,
        registro: 'R001',
        caixa: 'C1',
        lote: 'L001',
        autorizador: 'A00000',
        valorCartao: 50.00,
        valorDinheiro: 0,
        valorFatura: 0,
        desconto: 0,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        corrigido: false,
      },
    ];

    const cieloRows = [
      {
        idInterno: 'CIELO-LONELY',
        autorizador: 'A99999',
        valorBruto: 50.00,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15',
        horaVenda: '10:00',
        nsu: 'NSU-LONE',
      },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);
    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);

    assert.ok(cieloOnlyRows.length === 1,
      `Deveria haver 1 linha Cielo-only, mas havia ${cieloOnlyRows.length}`);

    const cieloOnly = cieloOnlyRows[0];
    assert.ok(
      cieloOnly.status.includes('Não encontrado no sistema'),
      `status deveria conter 'Não encontrado no sistema', mas tinha: ${JSON.stringify(cieloOnly.status)}`
    );
    assert.strictEqual(
      cieloOnly.statusLabel,
      'Não encontrado no sistema',
      `statusLabel deveria ser 'Não encontrado no sistema', mas era: '${cieloOnly.statusLabel}'`
    );
  });

});

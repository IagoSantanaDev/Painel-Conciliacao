import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  reconcileOne,
  buildCieloIndexWithDedup,
} from '../../src/js/services/reconciliation.js';

function makeRow(overrides = {}) {
  return {
    idInterno: 'h-test',
    registro: 'R001',
    caixa: 'C1',
    lote: 'L1',
    autorizador: '',
    valorCartao: 0,
    valorDinheiro: 0,
    valorFatura: 0,
    desconto: 0,
    bandeira: '',
    formaPagamento: '',
    parcelas: '',
    numeroMaquina: '',
    corrigido: false,
    ...overrides,
  };
}

function emptyCieloIndex() {
  return new Map();
}

describe('reconcileOne — branch coverage', () => {

  it('valorCartao=0 && valorDinheiro=0 && hasFinancialReference=true → "Sem valor de pagamento"', () => {
    const row = makeRow({
      valorCartao: 0,
      valorDinheiro: 0,
      valorFatura: 100,
      registro: '12345',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(
      result.status.includes('Sem valor de pagamento'),
      `expected 'Sem valor de pagamento' in status, got: ${result.status.join(' | ')}`
    );
  });

  it('Sem valor de pagamento: dispara via registro mesmo sem valorFatura', () => {

    const row = makeRow({
      valorCartao: 0,
      valorDinheiro: 0,
      valorFatura: 0,
      registro: 'REG-XYZ',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Sem valor de pagamento'),
      `registro sozinho deve disparar: ${result.status.join(' | ')}`);
  });

  it('Sem valor de pagamento: NÃO dispara sem hasFinancialReference', () => {

    const row = makeRow({
      valorCartao: 0,
      valorDinheiro: 0,
      valorFatura: 0,
      registro: '',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(!result.status.includes('Sem valor de pagamento'),
      `sem referência financeira não deve disparar: ${result.status.join(' | ')}`);
    assert.ok(result.status.includes('Conciliado'),
      `deve virar Conciliado: ${result.status.join(' | ')}`);
  });

  it('valorCartao>0 && !autorizador → "Sem autorizador"', () => {
    const row = makeRow({
      valorCartao: 100,
      autorizador: '',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(
      result.status.includes('Sem autorizador'),
      `expected 'Sem autorizador' in status, got: ${result.status.join(' | ')}`
    );
    assert.strictEqual(result.cielo, null,
      'Sem autorizador: cielo deve permanecer null (não tenta match)');
  });

  it('misto: valorCartao+valorDinheiro ≠ valorFatura → "Pagamento misto" + "Dinheiro Diferença"', () => {

    const row = makeRow({
      valorCartao: 50,
      valorDinheiro: 60,
      valorFatura: 100,
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Pagamento misto'),
      `expected 'Pagamento misto': ${result.status.join(' | ')}`);
    assert.ok(result.status.includes('Dinheiro Diferença'),
      `expected 'Dinheiro Diferença': ${result.status.join(' | ')}`);
  });

  it('misto: sem divergência (soma exata) → "Pagamento misto" sem "Dinheiro Diferença"', () => {

    const row = makeRow({
      valorCartao: 50,
      valorDinheiro: 50,
      valorFatura: 100,
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Pagamento misto'),
      `expected 'Pagamento misto': ${result.status.join(' | ')}`);
    assert.ok(!result.status.includes('Dinheiro Diferença'),
      `soma exata não deve disparar 'Dinheiro Diferença': ${result.status.join(' | ')}`);
  });

  it('misto com desconto que cobre diff NÃO dispara "Dinheiro Diferença"', () => {

    const row = makeRow({
      valorCartao: 50,
      valorDinheiro: 50,
      valorFatura: 110,
      desconto: '10,00',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Pagamento misto'),
      `expected 'Pagamento misto': ${result.status.join(' | ')}`);
    assert.ok(!result.status.includes('Dinheiro Diferença'),
      `misto com diff explicada por desconto NÃO deve disparar 'Dinheiro Diferença': ${result.status.join(' | ')}`);
  });

  it('misto: desconto NÃO cobre diff → "Dinheiro Diferença" AINDA dispara', () => {

    const row = makeRow({
      valorCartao: 50,
      valorDinheiro: 60,
      valorFatura: 100,
      desconto: '0,00',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Pagamento misto'),
      `expected 'Pagamento misto': ${result.status.join(' | ')}`);
    assert.ok(result.status.includes('Dinheiro Diferença'),
      `misto com diff real ainda deve disparar 'Dinheiro Diferença': ${result.status.join(' | ')}`);
  });

  it('corrigido=true + valorDinheiro>0: status inclui "Corrigido" e NÃO "À Conciliar"', () => {
    const row = makeRow({
      corrigido: true,
      valorCartao: 0,
      valorDinheiro: 50,
      valorFatura: 50,
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Corrigido'),
      `expected 'Corrigido': ${result.status.join(' | ')}`);
    assert.ok(!result.status.includes('À Conciliar'),
      `corrigido=true NÃO deve disparar 'À Conciliar': ${result.status.join(' | ')}`);
  });

  it('corrigido=true filtra blocking keywords antes de anexar "Corrigido"', () => {

    const row = makeRow({
      corrigido: true,
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
      autorizador: '',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(!result.status.includes('Sem autorizador'),
      `'Sem autorizador' deve ser filtrado quando corrigido=true: ${result.status.join(' | ')}`);
    assert.ok(result.status.includes('Corrigido'),
      `'Corrigido' deve estar presente: ${result.status.join(' | ')}`);
  });

  it('pickCieloSale: 2 vendas MESMO auth+valor (exatas) → ambiguous, candidates.length === 2', () => {

    const cieloRows = [
      { idInterno: 'CI-A', autorizador: 'A55555', valorBruto: 100.00, nsu: 'NSU-A' },
      { idInterno: 'CI-B', autorizador: 'A55555', valorBruto: 100.00, nsu: 'NSU-B' },
    ];
    const { index } = buildCieloIndexWithDedup(cieloRows);

    const hospitalRow = makeRow({
      autorizador: 'A55555',
      valorCartao: 100,
      valorFatura: 100,
      formaPagamento: 'CRÉDITO',
    });

    const result = reconcileOne(hospitalRow, index, new Set());

    assert.strictEqual(result.cielo, null,
      'sale deve ser null quando ambiguous com múltiplos exatos');
    assert.strictEqual(result.ambiguousCandidates.length, 2,
      `candidates deve ter 2 vendas: atual=${result.ambiguousCandidates.length}`);
    const candidateIds = result.ambiguousCandidates.map(c => c.idInterno).sort();
    assert.deepStrictEqual(candidateIds, ['CI-A', 'CI-B'],
      `candidates deve conter CI-A e CI-B: atual=${candidateIds.join(',')}`);
    assert.ok(result.status.includes('Pendente revisão'),
      `expected 'Pendente revisão': ${result.status.join(' | ')}`);
  });

  it('valorDinheiro>0 && valorCartao=0 sem divergência → "Dinheiro" sem "Dinheiro Diferença"', () => {
    const row = makeRow({
      valorCartao: 0,
      valorDinheiro: 50,
      valorFatura: 50,
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.ok(result.status.includes('Dinheiro'),
      `expected 'Dinheiro': ${result.status.join(' | ')}`);
    assert.ok(!result.status.includes('Dinheiro Diferença'),
      `sem divergência não deve disparar 'Dinheiro Diferença': ${result.status.join(' | ')}`);
  });

  it('valorDinheiro puro: define formaPagamento="ESPÉCIE" automaticamente', () => {

    const row = makeRow({
      valorCartao: 0,
      valorDinheiro: 50,
      valorFatura: 50,
      formaPagamento: '',
    });
    const result = reconcileOne(row, emptyCieloIndex(), new Set());
    assert.strictEqual(result.formaPagamento, 'ESPÉCIE',
      `formaPagamento deve ser 'ESPÉCIE' por inferência: atual='${result.formaPagamento}'`);
  });

});
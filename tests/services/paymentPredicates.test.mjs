import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  FILTERS,
  buildConsumedCieloIds,
  isCardPayment,
  isCardType,
  isCashPayment,
  isCieloOnly,
  isCorrigido,
  isDivergente,
  isOkRow,
  isOkRowBridge,
  isPendente,
  isNaoEncontrado,
} from '../../src/js/services/paymentPredicates.js';
import { normalizePdfBrand } from '../../src/js/utils/format.js';

describe('isCieloOnly / isCorrigido', () => {
  it('isCieloOnly identifica corretamente', () => {
    assert.strictEqual(isCieloOnly({ cieloOnly: true }), true);
    assert.strictEqual(isCieloOnly({}), false);
  });

  it('isCorrigido identifica corretamente', () => {
    assert.strictEqual(isCorrigido({ corrigido: true }), true);
    assert.strictEqual(isCorrigido({}), false);
  });
});

describe('isNaoEncontrado', () => {
  it('retorna true para cieloOnly', () => {
    assert.strictEqual(isNaoEncontrado({ cieloOnly: true }), true);
  });

  it('retorna true para statusLabel Não encontrado', () => {
    assert.strictEqual(isNaoEncontrado({ statusLabel: 'Não encontrado' }), true);
  });

  it('retorna false para outros status', () => {
    assert.strictEqual(isNaoEncontrado({ statusLabel: 'Conciliado' }), false);
  });
});

describe('isDivergente / isPendente', () => {
  it('isDivergente ignora corrigidas', () => {
    assert.strictEqual(isDivergente({ statusLabel: 'Divergente', corrigido: true }), false);
    assert.strictEqual(isDivergente({ statusLabel: 'Divergente' }), true);
    assert.strictEqual(isDivergente({ statusLabel: 'Conciliado' }), false);
  });

  it('isPendente ignora corrigidas', () => {
    assert.strictEqual(isPendente({ statusLabel: 'Pendente', corrigido: true }), false);
    assert.strictEqual(isPendente({ statusLabel: 'Pendente' }), true);
  });
});

describe('Paridade métrica↔filtro Conciliados', () => {
  it('card e filtro Conciliados contam o mesmo conjunto', () => {
    const rows = [
      { corrigido: true, statusLabel: 'Conciliado', status: [] },
      { corrigido: true, statusLabel: 'Conciliado', status: ['Dinheiro'] },
      { corrigido: true, statusLabel: 'Conciliado', status: ['Pagamento misto'] },
      { corrigido: false, statusLabel: 'Conciliado', status: [] },
      { corrigido: false, statusLabel: 'Divergente', status: [] },
    ];

    const card = rows.filter(isOkRowBridge).length;
    const filter = rows.filter(r => FILTERS.find(f => f.key === 'conciliado').predicate(r)).length;
    assert.strictEqual(card, 2);
    assert.strictEqual(filter, 2);
    assert.strictEqual(card, filter, 'card e filtro Conciliados devem contar o mesmo conjunto');
  });

  it('isOkRow (sem bridge) aceita corrigido+status bloqueante (não-roteirizável)', () => {
    const row = { corrigido: true, statusLabel: 'Divergente', status: ['Divergência'] };
    assert.strictEqual(isOkRow(row), true);
    assert.strictEqual(isOkRowBridge(row), true, 'isOkRowBridge aceita corrigido=true');
  });
});

describe('normalizePdfBrand', () => {
  it('mapeia variantes para canônico', () => {
    assert.strictEqual(normalizePdfBrand('Master - Credito'), 'MASTERCARD');
    assert.strictEqual(normalizePdfBrand('American Express'), 'AMERICAN EXPRESS');
    assert.strictEqual(normalizePdfBrand('Visa'), 'VISA');
    assert.strictEqual(normalizePdfBrand('Hipercard'), 'HIPERCARD');
    assert.strictEqual(normalizePdfBrand('Elo'), 'ELO');
  });

  it('cai para split por " - " se não casa variante', () => {
    assert.strictEqual(normalizePdfBrand('Elo - Credito'), 'ELO');
  });
});

describe('isCardType', () => {
  it('detecta crédito em formaPagamento', () => {
    assert.strictEqual(isCardType({ formaPagamento: 'CRÉDITO' }, 'credito'), true);
  });

  it('detecta débito em tipoCartao', () => {
    assert.strictEqual(isCardType({ tipoCartao: 'DÉBITO' }, 'debito'), true);
  });

  it('normaliza acentos (crédito → credito)', () => {
    assert.strictEqual(isCardType({ formaPagamento: 'Crédito' }, 'credito'), true);
  });

  it('considera row.cielo.formaPagamento como fallback', () => {
    assert.strictEqual(isCardType({ cielo: { formaPagamento: 'CRÉDITO' } }, 'credito'), true);
  });

  it('retorna false quando nenhum campo casa', () => {
    assert.strictEqual(isCardType({ formaPagamento: 'ESPÉCIE' }, 'credito'), false);
  });
});

describe('isCardPayment', () => {
  it('valorCartao positivo → true', () => {
    assert.strictEqual(isCardPayment({ valorCartao: 100 }), true);
  });

  it('detecta crédito/débito quando valorCartao é zero', () => {
    assert.strictEqual(isCardPayment({ valorCartao: 0, formaPagamento: 'CRÉDITO' }), true);
    assert.strictEqual(isCardPayment({ valorCartao: 0, formaPagamento: 'DÉBITO' }), true);
  });

  it('cieloOnly sempre retorna false', () => {
    assert.strictEqual(isCardPayment({ cieloOnly: true, valorCartao: 100 }), false);
  });

  it('linha vazia → false', () => {
    assert.strictEqual(isCardPayment({}), false);
  });
});

describe('isCashPayment', () => {
  it('valorDinheiro positivo → true', () => {
    assert.strictEqual(isCashPayment({ valorDinheiro: 50 }), true);
  });

  it('statusLabel Dinheiro → true', () => {
    assert.strictEqual(isCashPayment({ statusLabel: 'Dinheiro' }), true);
  });

  it('statusLabel Pagamento misto → true', () => {
    assert.strictEqual(isCashPayment({ statusLabel: 'Pagamento misto' }), true);
  });

  it('status contém À Conciliar → true', () => {
    assert.strictEqual(isCashPayment({ status: ['À Conciliar'] }), true);
  });

  it('cieloOnly sempre retorna false', () => {
    assert.strictEqual(isCashPayment({ cieloOnly: true, valorDinheiro: 100 }), false);
  });

  it('linha vazia → falsy', () => {
    assert.ok(!isCashPayment({}));
  });
});

describe('buildConsumedCieloIds', () => {
  it('ignora exceptIndex, Cielo-only e corrigidas', () => {
    const rows = [
      { cielo: { idInterno: 'A' } },
      { cieloOnly: true, cielo: { idInterno: 'B' } },
      { corrigido: true, cielo: { idInterno: 'C' } },
      { cielo: { idInterno: 'D' } },
    ];

    const matched = buildConsumedCieloIds(rows, 0);

    assert.deepStrictEqual([...matched], ['D']);
  });

  it('retorna Set vazio quando todas as linhas estão excluídas', () => {
    const rows = [
      { cieloOnly: true, cielo: { idInterno: 'A' } },
      { corrigido: true, cielo: { idInterno: 'B' } },
    ];

    const matched = buildConsumedCieloIds(rows, 0);

    assert.strictEqual(matched.size, 0);
  });
});

describe('FILTERS — Cielo-only só aparece em Não Encontrados', () => {

  const cieloOnly = { cieloOnly: true, statusLabel: 'Não encontrado no sistema', status: ['Não encontrado no sistema'] };

  it('Todos exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'todos');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Conciliados exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'conciliado');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Corrigidos exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'corrigido');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Cartão exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'cartao');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Crédito exclui Cielo-only (mesmo com formaPagamento CRÉDITO)', () => {
    const found = FILTERS.find(f => f.key === 'credito');
    const row = { ...cieloOnly, formaPagamento: 'CRÉDITO' };
    assert.strictEqual(found.predicate(row), false);
  });

  it('Débito exclui Cielo-only (mesmo com formaPagamento DÉBITO)', () => {
    const found = FILTERS.find(f => f.key === 'debito');
    const row = { ...cieloOnly, formaPagamento: 'DÉBITO' };
    assert.strictEqual(found.predicate(row), false);
  });

  it('Dinheiro/Espécie exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'dinheiro');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Divergentes exclui Cielo-only (mesmo se auth duplicado)', () => {
    const found = FILTERS.find(f => f.key === 'divergente');
    const row = { ...cieloOnly, autorizador: 'A1' };
    assert.strictEqual(found.predicate(row), false,
      'Cielo-only NUNCA entra em Divergentes — nem com auth duplicado');
  });

  it('Pendentes exclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'pendente');
    assert.strictEqual(found.predicate(cieloOnly), false);
  });

  it('Não Encontrados é o único que inclui Cielo-only', () => {
    const found = FILTERS.find(f => f.key === 'naoEncontrado');
    assert.strictEqual(found.predicate(cieloOnly), true);
  });
});

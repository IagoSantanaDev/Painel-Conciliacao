import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeMetrics, renderTableRow, rowMatchesFilter, rowMatchesSearch, getEffectiveRow, getDisplayPriority, sortResultsByPriority } from '../../src/js/ui/render.js';
import { normalizeText } from '../../src/js/utils/string.js';
import { STATUS_LABEL } from '../../src/js/services/paymentPredicates.js';

describe('computeMetrics', () => {

  it('deve retornar zeros para array vazio', () => {
    const result = computeMetrics([]);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.conciliados, 0);
    assert.strictEqual(result.divergentes, 0);
    assert.strictEqual(result.naoEncontrado, 0);
    assert.strictEqual(result.dinheiro, 0);
    assert.strictEqual(result.pendentes, 0);
    assert.strictEqual(result.cartao, 0);
    assert.strictEqual(result.valorCartao, 0);
    assert.strictEqual(result.valorDinheiro, 0);
    assert.strictEqual(result.valorTotal, 0);
  });

  it('deve contar registro conciliado corretamente', () => {
    const rows = [{ statusLabel: STATUS_LABEL.CONCILIADO }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.conciliados, 1);
  });

  it('deve contar registro divergente corretamente', () => {
    const rows = [{ statusLabel: STATUS_LABEL.DIVERGENTE }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.divergentes, 1);
  });

  it('deve contar registro não encontrado (Cielo-only) corretamente', () => {
    const rows = [{ cieloOnly: true }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.naoEncontrado, 1);
  });

  it('deve contar dinheiro corretamente (valorDinheiro > 0)', () => {
    const rows = [{ valorDinheiro: 100 }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.dinheiro, 1);
  });

  it('deve contar pendente corretamente', () => {
    const rows = [{ statusLabel: STATUS_LABEL.PENDENTE }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.pendentes, 1);
  });

  it('deve somar valores de cartão', () => {
    const rows = [{ valorCartao: 100 }, { valorCartao: 200 }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.cartao, 2);
    assert.strictEqual(result.valorCartao, 300);
  });

  it('deve somar valores de dinheiro', () => {
    const rows = [{ valorDinheiro: 50 }, { valorDinheiro: 75 }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.dinheiro, 2);
    assert.strictEqual(result.valorDinheiro, 125);
  });

  it('deve calcular valorTotal como soma de cartão e dinheiro', () => {
    const rows = [{ valorCartao: 100, valorDinheiro: 50 }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.valorTotal, 150);
  });

  it('deve lidar com valores undefined/null como zero', () => {
    const rows = [{ valorCartao: null, valorDinheiro: undefined }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.valorCartao, 0);
    assert.strictEqual(result.valorDinheiro, 0);
  });

  it('pagamento misto divergente NÃO conta em Dinheiro nem Cartão (só Divergentes)', () => {

    const rows = [{
      valorCartao: 100,
      valorDinheiro: 50,
      valorFatura: 200,
      statusLabel: 'Divergente',
      status: ['Conciliado', 'Pagamento misto', 'Dinheiro Diferença', 'À Conciliar'],
    }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.divergentes, 1, 'deve contar como Divergente');
    assert.strictEqual(result.dinheiro, 0, 'NÃO conta em Dinheiro quando divergente');
    assert.strictEqual(result.cartao, 1, 'Cartão mantém contagem mesmo divergente (teste em exportTd.test.mjs:122)');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.valorCartao, 100);
    assert.strictEqual(result.valorDinheiro, 50);
  });

  it('dinheiro puro divergente conta em Divergentes (não Dinheiro)', () => {

    const rows = [{
      valorCartao: 0,
      valorDinheiro: 100,
      valorFatura: 80,
      statusLabel: 'Divergente',
      status: ['Dinheiro Diferença', 'Dinheiro', 'À Conciliar'],
    }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.divergentes, 1);
    assert.strictEqual(result.dinheiro, 0, 'dinheiro diverge não conta no card Dinheiro/Espécie');
    assert.strictEqual(result.cartao, 0, 'não tem cartão');
    assert.strictEqual(result.total, 1);
  });

  it('dinheiro puro NÃO divergente continua contando em Dinheiro/Espécie', () => {

    const rows = [{
      valorCartao: 0,
      valorDinheiro: 200,
      valorFatura: 200,
      statusLabel: 'Conciliado',
      status: ['Dinheiro'],
    }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.divergentes, 0);
    assert.strictEqual(result.dinheiro, 1, 'dinheiro normal NÃO é divergente, conta normalmente');
    assert.strictEqual(result.cartao, 0);
  });

  it('cartão puro divergente mantém contagem em ambos cards (invariante exportTd)', () => {

    const rows = [{
      valorCartao: 100,
      valorCielo: 75,
      statusLabel: 'Divergente',
      status: ['Divergência valor cartão'],
    }];
    const result = computeMetrics(rows);
    assert.strictEqual(result.divergentes, 1);
    assert.strictEqual(result.cartao, 1, 'invariante: cartão divergente conta em Cartão também');
    assert.strictEqual(result.dinheiro, 0, 'não tem dinheiro');
  });

  it('row Conciliado com auth duplicado conta em Divergentes (não Conciliados)', () => {
    const rows = [{
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: 'A12345',
      status: ['Conciliado'],
      valorCartao: 100,
    }];
    const result = computeMetrics(rows, new Set(['A12345']), new Set());
    assert.strictEqual(result.divergentes, 1, 'auth duplicado força classificação Divergente');
    assert.strictEqual(result.conciliados, 0, 'não pode contar como Conciliado também');
    assert.strictEqual(result.total, 1);
  });

  it('row Cielo-only com auth duplicado NÃO vira Divergente — auth dup não se aplica a Cielo-only', () => {
    const rows = [{
      cieloOnly: true,
      autorizador: 'A12345',
      status: ['Não encontrado no sistema'],
      statusLabel: 'Não encontrado no sistema',
    }];
    const result = computeMetrics(rows, new Set(['A12345']));
    assert.strictEqual(result.divergentes, 0, 'Cielo-only NUNCA vira Divergente — nem com auth dup');
    assert.strictEqual(result.naoEncontrado, 1, 'Cielo-only continua em Não encontrado mesmo com auth dup');
  });

  it('row sem duplicatas mantém comportamento original', () => {
    const rows = [{
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: 'A12345',
      status: ['Conciliado'],
    }];
    const dupesAuth = new Set(['OUTRO']);
    const result = computeMetrics(rows, dupesAuth);
    assert.strictEqual(result.conciliados, 1);
    assert.strictEqual(result.divergentes, 0);
  });

});

describe('getEffectiveRow — duplicatas forçam Divergente', () => {

  it('sem duplicatas: retorna row sem modificação (mesma referência)', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO, autorizador: 'A12345', status: ['Conciliado'] };
    const result = getEffectiveRow(row, new Set(), new Set());
    assert.strictEqual(result, row, 'referência igual (zero overhead)');
  });

  it('com auth duplicado: statusLabel vira Divergente e ganha badge', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO, autorizador: 'A12345', status: ['Conciliado'] };
    const result = getEffectiveRow(row, new Set(['A12345']), new Set());
    assert.strictEqual(result.statusLabel, STATUS_LABEL.DIVERGENTE);
    assert.ok(result.status.includes('Auth duplicado'));
    assert.ok(result.status.includes('Conciliado'), 'preserva status original');
  });

  it('aceita sets vazios sem erro', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO };
    const result = getEffectiveRow(row, undefined);
    assert.strictEqual(result, row);
  });

  it('Cielo-only + auth duplicado: retorna row sem modificação (mesma referência)', () => {
    const row = {
      cieloOnly: true,
      autorizador: 'A12345',
      statusLabel: 'Não encontrado no sistema',
      status: ['Não encontrado no sistema'],
    };
    const result = getEffectiveRow(row, new Set(['A12345']));
    assert.strictEqual(result, row, 'Cielo-only deve ser retornado intacto, sem badge Auth duplicado');
    assert.ok(!result.status?.includes('Auth duplicado'),
      'Cielo-only NÃO pode ganhar badge Auth duplicado');
    assert.strictEqual(result.statusLabel, 'Não encontrado no sistema',
      'Cielo-only mantém statusLabel original');
  });
});

describe('rowMatchesFilter — duplicatas vão para Divergentes', () => {

  it('row Conciliado + auth duplicado aparece no filtro Divergentes e não Conciliados', () => {
    const row = {
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: 'A12345',
      status: ['Conciliado'],
    };
    const effective = getEffectiveRow(row, new Set(['A12345']), new Set());
    assert.strictEqual(rowMatchesFilter(effective, 'divergente'), true,
      'com auth duplicado entra na categoria Divergentes');
    assert.strictEqual(rowMatchesFilter(effective, 'conciliado'), false,
      'autenticamente conciled + dup NÃO pode ir pra Conciliados');
  });

  it('row Não Encontrado + auth duplicado continua em Não Encontrados (NÃO migra pra Divergentes)', () => {
    const row = {
      cieloOnly: true,
      autorizador: 'A12345',
      status: ['Não encontrado no sistema'],
      statusLabel: 'Não encontrado no sistema',
    };
    const effective = getEffectiveRow(row, new Set(['A12345']));
    assert.strictEqual(rowMatchesFilter(effective, 'naoEncontrado'), true,
      'Cielo-only fica em Não Encontrados mesmo com auth duplicado');
    assert.strictEqual(rowMatchesFilter(effective, 'divergente'), false,
      'Cielo-only NÃO migra pra Divergentes — auth dup não se aplica a Cielo-only');
  });

});

;

describe('Cielo-only rows não recebem checkbox', () => {

  it('Cielo-only row NÃO corrigido NÃO deve renderizar checkbox', () => {

    const row = {
      cieloOnly: true,
      statusLabel: 'Não encontrado no sistema',
      status: ['Não encontrado no sistema'],
      corrigido: false,
    };
    const html = renderTableRow(row, 0, new Set());
    assert.ok(
      !html.includes('type="checkbox"'),
      'Cielo-only não deve ter checkbox — marcar como corrigida causaria dupla contagem',
    );
    assert.ok(
      html.includes('conciliado-empty'),
      'espera-se <span class="conciliado-empty"> como placeholder',
    );
  });

  it('Cielo-only row não pode virar corrigida pela UI (defesa arquitetural)', () => {

    const row = {
      cieloOnly: true,
      statusLabel: 'Não encontrado no sistema',
      status: ['Não encontrado no sistema'],
      corrigido: false,
    };
    const html = renderTableRow(row, 0, new Set());

    assert.ok(!html.includes('type="checkbox"'), 'cielo-only não deve ter checkbox');
    assert.ok(html.includes('conciliado-empty'), 'placeholder span deve estar presente');

    assert.ok(
      html.includes('<td class="td-conciliado"><span class="conciliado-empty"'),
      'célula conciliado usa placeholder, não input',
    );
  });

  it('row hospitalar divergente/Pendente/Dinheiro mantêm checkbox (não-regressão)', () => {

    for (const statusLabel of ['Divergente', 'Não encontrado', 'Pendente', 'Dinheiro', 'Pagamento misto']) {
      const row = { statusLabel, status: [statusLabel], corrigido: false };
      const html = renderTableRow(row, 0, new Set());
      assert.ok(html.includes('type="checkbox"'), `${statusLabel} deve manter checkbox`);
    }
  });
});

describe('dup badges não duplicam quando renderTableRow recebe row que parece ter badge', () => {

  it('Auth duplicado aparece uma vez (não duas) no HTML para row com auth duplicado', () => {
    const row = {
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: 'A12345',
      registro: 'R001',
      status: ['Conciliado'],
      corrigido: false,
    };
    const dupes = new Set(['A12345']);
    const html = renderTableRow(row, 0, dupes);

    const matches = html.match(/Auth duplicado/g) || [];
    assert.strictEqual(matches.length, 1,
      `Auth duplicado deve aparecer exatamente 1 vez, apareceu ${matches.length}`);
  });

  it('row sem duplicatas não ganha badge de Auth duplicado', () => {
    const row = {
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: 'A99999',
      status: ['Conciliado'],
      corrigido: false,
    };
    const html = renderTableRow(row, 0, new Set(['OUTRO']));
    assert.ok(!html.includes('Auth duplicado'));
  });

  it('badge Auth duplicado aparece uma vez quando row já vem com Auth duplicado no status (reconcileOne + getEffectiveRow)', () => {
    const row = {
      statusLabel: STATUS_LABEL.CONCILIADO,
      autorizador: '405970',
      registro: '903705',
      status: ['Auth duplicado', 'Conciliado'],
      corrigido: false,
    };
    const dupes = new Set(['405970']);
    const html = renderTableRow(row, 0, dupes);

    const matches = html.match(/Auth duplicado/g) || [];
    assert.strictEqual(matches.length, 1,
      `getEffectiveRow não deve duplicar badge Auth duplicado quando reconcileOne já adicionou. Apareceu ${matches.length}x`);
  });
});

describe('getDisplayPriority — auth duplicado tem priority máxima', () => {

  it('row com auth em dupes retorna -1 (antes de corrigido/Conciliado)', () => {
    const row = { autorizador: 'A1', statusLabel: STATUS_LABEL.CONCILIADO };
    assert.strictEqual(getDisplayPriority(row, new Set(['A1'])), -1);
  });

  it('row com auth em dupes retorna -1 mesmo se status for Pendente (gemea)', () => {
    const row = { autorizador: 'A1', statusLabel: STATUS_LABEL.PENDENTE };
    assert.strictEqual(getDisplayPriority(row, new Set(['A1'])), -1);
  });

  it('row sem dup: Conciliado retorna 0', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO };
    assert.strictEqual(getDisplayPriority(row), 0);
  });

  it('row sem dup: Pendente retorna 4', () => {
    const row = { statusLabel: STATUS_LABEL.PENDENTE };
    assert.strictEqual(getDisplayPriority(row), 4);
  });

  it('dupes vazio (default) preserva lógica original', () => {
    const row = { autorizador: 'A1', statusLabel: STATUS_LABEL.CONCILIADO };
    assert.strictEqual(getDisplayPriority(row), 0);
  });

  it('NÃO encontrado + auth dup retorna 999 (FORA do final, antes de qualquer outro)', () => {
    const row = {
      autorizador: 'A1',
      statusLabel: STATUS_LABEL.DIVERGENTE,
      _originalStatusLabel: STATUS_LABEL.NAO_ENCONTRADO,
    };
    assert.strictEqual(getDisplayPriority(row, new Set(['A1'])), 999);
  });

  it('Conciliado + auth dup (original Conciliado) retorna -1 (INÍCIO)', () => {
    const row = {
      autorizador: 'A1',
      statusLabel: STATUS_LABEL.DIVERGENTE,
      _originalStatusLabel: STATUS_LABEL.CONCILIADO,
    };
    assert.strictEqual(getDisplayPriority(row, new Set(['A1'])), -1);
  });

  it('Divergente + auth dup (original Divergente) retorna -1 (INÍCIO)', () => {
    const row = {
      autorizador: 'A1',
      statusLabel: STATUS_LABEL.DIVERGENTE,
      _originalStatusLabel: STATUS_LABEL.DIVERGENTE,
    };
    assert.strictEqual(getDisplayPriority(row, new Set(['A1'])), -1);
  });
});

describe('sortResultsByPriority — auth duplicado sempre primeiro', () => {

  it('Conciliado + auth dup vem antes de Divergente normal', () => {
    const dupes = new Set(['A1']);
    const results = [
      { row: { autorizador: 'B1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 0, priority: 3 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.CONCILIADO }, originalIndex: 1, priority: -1 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.strictEqual(sorted[0].row.autorizador, 'A1', 'Conciliado+auth dup deve vir primeiro');
    assert.strictEqual(sorted[1].row.autorizador, 'B1');
  });

  it('gemea (Pendente) + auth dup vem antes de Divergente normal', () => {
    const dupes = new Set(['A1']);
    const results = [
      { row: { autorizador: 'B1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 0, priority: 3 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.PENDENTE }, originalIndex: 1, priority: -1 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.strictEqual(sorted[0].row.autorizador, 'A1', 'gemea (Pendente) com auth dup deve vir primeiro');
  });

  it('Conciliado+auth dup e gemea do mesmo auth ficam juntas no topo (mesma groupPriority)', () => {
    const dupes = new Set(['A1']);
    const results = [
      { row: { autorizador: 'B1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 5, priority: 3 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.PENDENTE }, originalIndex: 2, priority: -1 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.CONCILIADO }, originalIndex: 3, priority: -1 },
      { row: { autorizador: 'C1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 7, priority: 3 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.ok(['A1', 'A1'].includes(sorted[0].row.autorizador), 'topo é auth dup');
    assert.ok(['A1', 'A1'].includes(sorted[1].row.autorizador), 'segundo também é auth dup');
    assert.ok(sorted[2].row.autorizador !== 'A1', 'terceiro não é auth dup');
  });

  it('duas auths diferentes duplicadas: agrupa por auth, ordena auths alfabeticamente entre si', () => {
    const dupes = new Set(['A2', 'A1']);
    const results = [
      { row: { autorizador: 'A2', statusLabel: STATUS_LABEL.CONCILIADO }, originalIndex: 0, priority: -1 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.PENDENTE }, originalIndex: 1, priority: -1 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.strictEqual(sorted[0].row.autorizador, 'A1', 'A1 antes de A2 (alfabético)');
    assert.strictEqual(sorted[1].row.autorizador, 'A2');
  });

  it('não-dup: ordem de prioridade padrão (Conciliado < Divergente < Pendente)', () => {
    const results = [
      { row: { autorizador: 'B', statusLabel: STATUS_LABEL.PENDENTE }, originalIndex: 0, priority: 4 },
      { row: { autorizador: 'A', statusLabel: STATUS_LABEL.CONCILIADO }, originalIndex: 1, priority: 0 },
      { row: { autorizador: 'C', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 2, priority: 3 },
    ];
    const sorted = sortResultsByPriority(results, new Set());
    assert.strictEqual(sorted[0].row.autorizador, 'A', 'Conciliado (0) primeiro');
    assert.strictEqual(sorted[1].row.autorizador, 'C', 'Divergente (3) segundo');
    assert.strictEqual(sorted[2].row.autorizador, 'B', 'Pendente (4) ultimo');
  });

  it('nao muta o array de entrada', () => {
    const dupes = new Set(['A1']);
    const results = [
      { row: { autorizador: 'B1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 0, priority: 3 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.CONCILIADO }, originalIndex: 1, priority: -1 },
    ];
    const original = [...results];
    sortResultsByPriority(results, dupes);
    assert.deepStrictEqual(results, original, 'array original nao pode ser mutado');
  });

  it('NÃO encontrado + auth dup fica no FINAL (priority 999), depois de Divergente normal', () => {
    const dupes = new Set(['A1']);
    const results = [
      { row: { autorizador: 'B1', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 0, priority: 3 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.DIVERGENTE, _originalStatusLabel: 'Não encontrado' }, originalIndex: 1, priority: 999 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.strictEqual(sorted[0].row.autorizador, 'B1', 'Divergente normal primeiro');
    assert.strictEqual(sorted[1].row.autorizador, 'A1', 'Não encontrado + auth dup no FINAL');
  });

  it('ordenação mista: Conciliado+auth dup → Divergente normal → Nao encontrado+auth dup', () => {
    const dupes = new Set(['A1', 'A2']);
    const results = [
      { row: { autorizador: 'B', statusLabel: STATUS_LABEL.DIVERGENTE }, originalIndex: 0, priority: 3 },
      { row: { autorizador: 'A2', statusLabel: STATUS_LABEL.DIVERGENTE, _originalStatusLabel: 'Não encontrado' }, originalIndex: 1, priority: 999 },
      { row: { autorizador: 'A1', statusLabel: STATUS_LABEL.DIVERGENTE, _originalStatusLabel: 'Conciliado' }, originalIndex: 2, priority: -1 },
    ];
    const sorted = sortResultsByPriority(results, dupes);
    assert.strictEqual(sorted[0].row.autorizador, 'A1', 'Conciliado+auth dup no topo');
    assert.strictEqual(sorted[1].row.autorizador, 'B', 'Divergente normal no meio');
    assert.strictEqual(sorted[2].row.autorizador, 'A2', 'Nao encontrado+auth dup no final');
  });
});

describe('rowMatchesFilter', () => {

  it('deve retornar true para filter "todos" em row hospitalar (não Cielo-only)', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO };
    assert.strictEqual(rowMatchesFilter(row, 'todos'), true);
  });

  it('NÃO encontrado no sistema (Cielo-only) deve ficar fora do filtro "todos"', () => {
    const row = { cieloOnly: true, statusLabel: 'Não encontrado no sistema' };
    assert.strictEqual(rowMatchesFilter(row, 'todos'), false,
      'Cielo-only sai de Todos — continua acessível via filtro Não Encontrados');
  });

  it('filtro "naoEncontrado" continua incluindo Cielo-only', () => {
    const row = { cieloOnly: true, statusLabel: 'Não encontrado no sistema' };
    assert.strictEqual(rowMatchesFilter(row, 'naoEncontrado'), true);
  });

  it('deve retornar false para filter null/undefined/vazio (filtro inexistente)', () => {
    const row = {};

    assert.strictEqual(rowMatchesFilter(row, null), false);
    assert.strictEqual(rowMatchesFilter(row, undefined), false);
    assert.strictEqual(rowMatchesFilter(row, ''), false);
  });

  it('deve filtrar por conciliado (isOkRowBridge)', () => {
    const row = { statusLabel: STATUS_LABEL.CONCILIADO, status: ['Conciliado'] };
    assert.strictEqual(rowMatchesFilter(row, 'conciliado'), true);
  });

  it('deve filtrar por dinheiro (isCashPayment)', () => {
    const row = { valorDinheiro: 100 };
    assert.strictEqual(rowMatchesFilter(row, 'dinheiro'), true);
  });

  it('deve filtrar por divergente (isDivergente)', () => {
    const row = { statusLabel: STATUS_LABEL.DIVERGENTE };
    assert.strictEqual(rowMatchesFilter(row, 'divergente'), true);
  });

  it('deve filtrar por pendente (isPendente)', () => {
    const row = { statusLabel: STATUS_LABEL.PENDENTE };
    assert.strictEqual(rowMatchesFilter(row, 'pendente'), true);
  });

  it('deve filtrar por cartão (isCardPayment)', () => {
    const row = { valorCartao: 100 };
    assert.strictEqual(rowMatchesFilter(row, 'cartao'), true);
  });

  it('deve filtrar não encontrados (Cielo-only)', () => {
    const row = { cieloOnly: true };
    assert.strictEqual(rowMatchesFilter(row, 'naoEncontrado'), true);
  });

});

describe('rowMatchesSearch', () => {

  it('deve retornar true para query vazia', () => {
    const row = { registro: '123', caixa: '1' };
    assert.strictEqual(rowMatchesSearch(row, ''), true);
  });

  it('deve retornar true para query null/undefined', () => {
    const row = { registro: '123' };
    assert.strictEqual(rowMatchesSearch(row, null), true);
    assert.strictEqual(rowMatchesSearch(row, undefined), true);
  });

  it('deve encontrar registro correspondente', () => {
    const row = { registro: '12345', caixa: '', lote: '', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, '12345'), true);
  });

  it('deve encontrar em campo caixa', () => {
    const row = { registro: '', caixa: 'A001', lote: '', autorizador: '', dataPagamento: '' };

    assert.strictEqual(rowMatchesSearch(row, normalizeText('A001')), true);
  });

  it('deve encontrar em campo lote', () => {
    const row = { registro: '', caixa: '', lote: 'Lote 5', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, normalizeText('Lote 5')), true);
  });

  it('deve encontrar em campo autorizador', () => {
    const row = { registro: '', caixa: '', lote: '', autorizador: 'AUTH123', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, normalizeText('AUTH123')), true);
  });

  it('deve encontrar em campo dataPagamento', () => {
    const row = { registro: '', caixa: '', lote: '', autorizador: '', dataPagamento: '2024-01-15' };
    assert.strictEqual(rowMatchesSearch(row, normalizeText('2024-01-15')), true);
  });

  it('deve ser case-insensitive', () => {
    const row = { registro: 'João Silva', caixa: '', lote: '', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, normalizeText('joão silva')), true);
    assert.strictEqual(rowMatchesSearch(row, normalizeText('JOÃO SILVA')), true);
  });

  it('deve normalizar acentos para busca', () => {
    const row = { registro: 'João', caixa: '', lote: '', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, normalizeText('joao')), true);
  });

  it('rowMatchesSearch NÃO normaliza query internamente (perf — caller obrigatório)', () => {

    const row = { registro: '', caixa: 'a001', lote: '', autorizador: '', dataPagamento: '' };

    assert.strictEqual(rowMatchesSearch(row, 'A001'), false,
      'rowMatchesSearch não deve normalizar query — caller é obrigado a chamar normalizeText()');

    assert.strictEqual(rowMatchesSearch(row, normalizeText('A001')), true);
  });

  it('query raw com acentos NÃO casa (caller precisa normalizar)', () => {

    const row = { registro: 'João', caixa: '', lote: '', autorizador: '', dataPagamento: '' };

    assert.strictEqual(rowMatchesSearch(row, 'João'), false,
      'query raw com acento não casa porque normalizeText só é aplicado ao haystack');
    assert.strictEqual(rowMatchesSearch(row, normalizeText('João')), true);
  });

  it('deve retornar false quando não encontra correspondência', () => {
    const row = { registro: '123', caixa: '', lote: '', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, '999'), false);
  });

  it('deve ignorar campos vazios', () => {
    const row = { registro: '', caixa: '', lote: '', autorizador: '', dataPagamento: '' };
    assert.strictEqual(rowMatchesSearch(row, 'teste'), false);
  });

});

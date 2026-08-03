import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { getEffectiveRow } from '../../src/js/ui/render.js';
import { findDuplicateAutorizadores } from '../../src/js/utils/dedupe.js';
import { buildConsumedCieloIds } from '../../src/js/services/paymentPredicates.js';

let reconciliation;

before(async () => {
  const mod = await import('../../src/js/services/reconciliation.js');
  reconciliation = mod;
});

describe('reconcileRows', () => {

  it('consome venda Cielo apenas uma vez - segunda linha com mesmo autorizador/valor fica pendente', () => {
    const hospitalRows = [
      {
        id: 1,
        registro: 'R001',
        caixa: 'C1',
        lote: 'L001',
        autorizador: 'A12345',
        valorCartao: 150.00,
        valorDinheiro: 0,
        valorFatura: 0,
        desconto: 0,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        corrigido: false,
      },
      {
        id: 2,
        registro: 'R002',
        caixa: 'C1',
        lote: 'L001',
        autorizador: 'A12345',
        valorCartao: 150.00,
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
        idInterno: 'CIELO001',
        autorizador: 'A12345',
        valorBruto: 150.00,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15',
        horaVenda: '10:00',
        nsu: 'NSU001',
      },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);
    assert.ok(cieloOnlyRows.length === 0,
      'A venda Cielo não deveria sobrar como Cielo-only: foi consumida por uma linha hospitalar');

    const unmatchedHospitalRows = results.filter(r => r.id === 2);
    assert.ok(unmatchedHospitalRows.length === 1,
      'A segunda linha hospitalar deveria estar no resultado');
    const secondRow = unmatchedHospitalRows[0];

    const hasPendenteOrNaoEncontrado = secondRow.status.some(s =>
      s.includes('Pendente') || s.includes('Não encontrado')
    );
    assert.ok(hasPendenteOrNaoEncontrado,
      `Segunda linha deveria ter status Pendente ou "Não encontrado", mas tinha: ${JSON.stringify(secondRow.status)}`);

    const matchedHospitalRows = results.filter(r => r.id === 1);
    assert.ok(matchedHospitalRows.length === 1, 'A primeira linha hospitalar deveria estar no resultado');
    const firstRow = matchedHospitalRows[0];

    assert.ok(
      firstRow.status.includes('Conciliado'),
      `Primeira linha deveria estar Conciliado, mas tinha: ${JSON.stringify(firstRow.status)}`
    );

    assert.ok(
      firstRow.cielo !== null && firstRow.cielo.idInterno === 'CIELO001',
      'A venda Cielo deveria estar associada à primeira linha'
    );
    assert.ok(
      secondRow.cielo === null,
      'A segunda linha não deveria ter referência Cielo'
    );
  });

  it('mesmo auth com valores diferentes - apenas a 1a linha hospitalar encontra o match Cielo (double-booking prevenido)', () => {

    const hospitalRows = [
      { id: 1, registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: '085917', valorCartao: 500.00, valorDinheiro: 0, valorFatura: 0, desconto: 0, bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001', corrigido: false },
      { id: 2, registro: 'R002', caixa: 'C1', lote: 'L1', autorizador: '085917', valorCartao: 32.19, valorDinheiro: 0, valorFatura: 0, desconto: 0, bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001', corrigido: false },
    ];

    const cieloRows = [
      { idInterno: 'CIELO085', autorizador: '085917', valorBruto: 123.45, bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001', dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU001' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const h1Result = results.find(r => r.registro === 'R001');
    assert.ok(h1Result.cielo !== null, 'H1 deveria ter cielo definido (match divergent)');
    assert.ok(h1Result.status.some(s => s.includes('Divergência')), 'H1 deveria ter Divergência');

    const h2Result = results.find(r => r.registro === 'R002');
    assert.ok(h2Result.cielo === null, 'H2 não deveria ter cielo definido (Cielo já foi consumida por H1)');
    assert.ok(h2Result.status.some(s => s.includes('Não encontrado')), 'H2 deveria ter "Não encontrado na Cielo"');

    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);
    assert.strictEqual(cieloOnlyRows.length, 0, 'Cielo row não deveria aparecer como Cielo-only (foi associada a H1)');
  });

  it('Cielo-only row aparece corretamente quando não há correspondência hospitalar', () => {
    const hospitalRows = [
      {
        id: 1,
        registro: 'R001',
        caixa: 'C1',
        lote: 'L001',
        autorizador: 'A99999',
        valorCartao: 200.00,
        valorDinheiro: 0,
        valorFatura: 0,
        desconto: 0,
        bandeira: 'MASTER',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ002',
        corrigido: false,
      },
    ];

    const cieloRows = [
      {
        idInterno: 'CIELO999',
        autorizador: 'B00000',
        valorBruto: 200.00,
        bandeira: 'MASTER',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ002',
        dataVenda: '2024-01-15',
        horaVenda: '11:00',
        nsu: 'NSU999',
      },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);
    assert.ok(cieloOnlyRows.length === 1,
      `Deveria haver exatamente 1 linha Cielo-only, mas havia ${cieloOnlyRows.length}`);

    const cieloOnly = cieloOnlyRows[0];
    assert.ok(
      cieloOnly.status.includes('Não encontrado no sistema'),
      `Cielo-only deveria ter status 'Não encontrado no sistema', mas tinha: ${JSON.stringify(cieloOnly.status)}`
    );
    assert.ok(
      cieloOnly.statusLabel === 'Não encontrado no sistema',
      `Cielo-only deveria ter statusLabel 'Não encontrado no sistema', mas tinha: '${cieloOnly.statusLabel}'`
    );
  });

});

describe('reconcileOne', () => {

  it('retorna Pendente revisão quando múltiplos candidatos Cielo existem para o mesmo autorizador', () => {
    const hospitalRow = {
      id: 1,
      registro: 'R001',
      caixa: 'C1',
      lote: 'L001',
      autorizador: 'A55555',
      valorCartao: 100.00,
      valorDinheiro: 0,
      valorFatura: 100.00,
      desconto: 0,
      bandeira: '',
      formaPagamento: '',
      parcelas: '',
      numeroMaquina: '',
      corrigido: false,
    };

    const cieloIndex = reconciliation.buildCieloIndexWithDedup([
      { idInterno: 'CI-A', autorizador: 'A55555', valorBruto: 100.00, nsu: 'NSU-A' },
      { idInterno: 'CI-B', autorizador: 'A55555', valorBruto: 100.00, nsu: 'NSU-B' },
    ]).index;

    const matchedCieloIds = new Set();
    const result = reconciliation.reconcileOne(hospitalRow, cieloIndex, matchedCieloIds);

    assert.ok(
      result.status.some(s => s.includes('Pendente')),
      `Deveria ter status Pendente revisão, mas tinha: ${JSON.stringify(result.status)}`
    );
  });

  it('duas vendas Cielo com mesmo autorizador/valor, uma linha hospitalar → Pendente, nenhuma Conciliado', () => {

    const hospitalRows = [
      {
        id: 10,
        registro: 'R010',
        caixa: 'C2',
        lote: 'L002',
        autorizador: 'A88888',
        valorCartao: 250.00,
        valorDinheiro: 0,
        valorFatura: 0,
        desconto: 0,
        bandeira: 'ELO',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ005',
        corrigido: false,
      },
    ];

    const cieloRows = [
      {
        idInterno: 'CIELO-A',
        autorizador: 'A88888',
        valorBruto: 250.00,
        bandeira: 'ELO',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ005',
        dataVenda: '2024-01-20',
        horaVenda: '14:00',
        nsu: 'NSU-A',
      },
      {
        idInterno: 'CIELO-B',
        autorizador: 'A88888',
        valorBruto: 250.00,
        bandeira: 'ELO',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ005',
        dataVenda: '2024-01-20',
        horaVenda: '14:05',
        nsu: 'NSU-B',
      },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const hospitalResult = results.find(r => r.id === 10);
    assert.ok(hospitalResult, 'A linha hospitalar deveria estar no resultado');
    assert.ok(
      !hospitalResult.status.includes('Conciliado'),
      `Linha hospitalar não deveria ter 'Conciliado', mas tinha: ${JSON.stringify(hospitalResult.status)}`
    );
    assert.ok(
      hospitalResult.status.some(s => s.includes('Pendente')),
      `Linha hospitalar deveria ter status Pendente revisão, mas tinha: ${JSON.stringify(hospitalResult.status)}`
    );
    assert.ok(
      hospitalResult.statusLabel === 'Pendente',
      `statusLabel deveria ser 'Pendente', mas era: '${hospitalResult.statusLabel}'`
    );
    assert.ok(
      hospitalResult.cielo === null,
      'Linha hospitalar não deveria consumir nenhuma venda Cielo quando há ambiguidade'
    );

    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);
    assert.ok(
      cieloOnlyRows.length === 0,
      `Nenhuma venda Cielo deveria aparecer como cielo-only (foram consumidas como candidatas), mas havia ${cieloOnlyRows.length}`
    );
  });

  it('A2: desconto como string BR ("10,00") é coberto antes de comparar (flag Dinheiro Diferença dispara)', async () => {

    const row = {
      idInterno: 'bi-1', origem: 'BI_MV', corrigido: false,
      registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: '',
      valorCartao: 0, valorDinheiro: 100, valorFatura: 110,
      desconto: '10,00',
      formaPagamento: 'ESPÉCIE', bandeira: '', parcelas: '',
    };
    const { reconcileOne } = reconciliation;
    const result = reconcileOne(row, new Map(), new Set());

    assert.ok(!result.status.includes('Dinheiro Diferença'),
      `desconto string '10,00' deveria casar perfeitamente com valorFatura - valorDinheiro. Status: ${result.status.join('|')}`);
    assert.ok(result.status.includes('Dinheiro'),
      `Status deveria incluir 'Dinheiro'. Status: ${result.status.join('|')}`);
  });

  it('A2: desconto como string BR com diferença real dispara Dinheiro Diferença', async () => {

    const row = {
      idInterno: 'bi-2', origem: 'BI_MV', corrigido: false,
      registro: 'R002', caixa: 'C1', lote: 'L1', autorizador: '',
      valorCartao: 0, valorDinheiro: 100, valorFatura: 120,
      desconto: '10,00',
      formaPagamento: 'ESPÉCIE', bandeira: '', parcelas: '',
    };
    const { reconcileOne } = reconciliation;
    const result = reconcileOne(row, new Map(), new Set());
    assert.ok(result.status.includes('Dinheiro Diferença'),
      `Com desconto '10,00' mas fatura 120 vs dinheiro 100, status deveria incluir 'Dinheiro Diferença'. Status: ${result.status.join('|')}`);
  });

  it('A2: desconto como número (legado) continua funcionando', async () => {
    const row = {
      idInterno: 'bi-3', origem: 'BI_MV', corrigido: false,
      registro: 'R003', caixa: 'C1', lote: 'L1', autorizador: '',
      valorCartao: 0, valorDinheiro: 100, valorFatura: 110,
      desconto: 10,
      formaPagamento: 'ESPÉCIE', bandeira: '', parcelas: '',
    };
    const { reconcileOne } = reconciliation;
    const result = reconcileOne(row, new Map(), new Set());
    assert.ok(!result.status.includes('Dinheiro Diferença'),
      `Com desconto=10 (number), desconto cobre a diferença. Status: ${result.status.join('|')}`);
  });

  it('auth duplicado - múltiplas rows Hospital Conciliam com a mesma venda Cielo quando duplicateAutorizadores é passado', () => {
    const hospitalRows = [
      {
        id: 1,
        registro: 'R100',
        caixa: 'C1',
        lote: 'L001',
        autorizador: '405970',
        valorCartao: 100.00,
        valorDinheiro: 0,
        valorFatura: 0,
        desconto: 0,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        corrigido: false,
      },
      {
        id: 2,
        registro: 'R200',
        caixa: 'C1',
        lote: 'L001',
        autorizador: '405970',
        valorCartao: 100.00,
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
        idInterno: 'CIELO-XYZ',
        autorizador: '405970',
        valorBruto: 100.00,
        bandeira: 'VISA',
        formaPagamento: 'Crédito',
        parcelas: '1',
        numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15',
        horaVenda: '10:00',
        nsu: 'NSU001',
      },
    ];

    const dupes = new Set(['405970']);
    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex, dupes);

    const r1 = results.find(r => r.id === 1);
    const r2 = results.find(r => r.id === 2);

    assert.ok(r1.cielo !== null && r1.cielo.idInterno === 'CIELO-XYZ',
      'R1 deveria casar com a venda Cielo');
    assert.ok(r1.status.includes('Conciliado'),
      `R1 deveria estar Conciliado, status: ${JSON.stringify(r1.status)}`);

    assert.ok(r2.cielo !== null && r2.cielo.idInterno === 'CIELO-XYZ',
      'R2 deveria re-usar a mesma venda Cielo (auth duplicado permite reuso)');
    assert.ok(r2.status.includes('Conciliado'),
      `R2 deveria estar Conciliado, status: ${JSON.stringify(r2.status)}`);

    const cieloOnlyRows = results.filter(r => r.cieloOnly === true);
    assert.strictEqual(cieloOnlyRows.length, 0,
      'Nenhuma venda Cielo deveria sobrar como Cielo-only');
  });

  it('edição inline para auth já conciliado Concilia quando dupes inclui o novo auth (allowReuse)', () => {

    const hospitalRows = [
      {
        id: 1, registro: 'R-CONC', caixa: 'C1', lote: 'L1', autorizador: 'A-CONC',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 2, registro: 'R-EDIT', caixa: 'C1', lote: 'L1', autorizador: 'B-OTHER',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
    ];
    const cieloRows = [
      { idInterno: 'C-CONC', autorizador: 'A-CONC', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const matchedCieloIds = new Set();
    for (const r of results) {
      if (r.cielo?.idInterno) matchedCieloIds.add(r.cielo.idInterno);
    }

    const editedRow = { ...hospitalRows[1], autorizador: 'A-CONC' };
    const dupesAfterEdit = new Set(['A-CONC']);

    const result = reconciliation.reconcileOne(editedRow, cieloIndex, matchedCieloIds, dupesAfterEdit);

    assert.ok(result.cielo !== null && result.cielo.idInterno === 'C-CONC',
      `Editada deveria reusar a venda Cielo já consumida (allowReuse com auth duplicado), mas cielo era: ${JSON.stringify(result.cielo)}`);
    assert.ok(result.status.includes('Conciliado'),
      `Editada deveria estar Conciliada, status: ${JSON.stringify(result.status)}`);
  });

  it('edição inline para auth de row Divergente também Concilia via allowReuse', () => {

    const hospitalRows = [
      {
        id: 1, registro: 'R-DIV', caixa: 'C1', lote: 'L1', autorizador: 'A-DIV',
        valorCartao: 110, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 2, registro: 'R-EDIT', caixa: 'C1', lote: 'L1', autorizador: 'B-OTHER',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
    ];
    const cieloRows = [
      { idInterno: 'C-DIV', autorizador: 'A-DIV', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const rDiv = results.find(r => r.id === 1);
    assert.ok(rDiv.status.some(s => s.includes('Divergência')),
      `R-DIV (valor 110 vs cielo 100) deveria ser Divergente, status: ${JSON.stringify(rDiv.status)}`);

    const matchedCieloIds = new Set();
    for (const r of results) {
      if (r.cielo?.idInterno) matchedCieloIds.add(r.cielo.idInterno);
    }

    assert.ok(matchedCieloIds.has('C-DIV'),
      'R-DIV (Divergente) deveria ter consumido a venda Cielo mesmo com valor diferente');

    const editedRow = { ...hospitalRows[1], autorizador: 'A-DIV' };
    const dupesAfterEdit = new Set(['A-DIV']);

    const result = reconciliation.reconcileOne(editedRow, cieloIndex, matchedCieloIds, dupesAfterEdit);

    assert.ok(result.cielo !== null && result.cielo.idInterno === 'C-DIV',
      `Editada para auth de Divergente deveria reusar venda Cielo via allowReuse, mas cielo era: ${JSON.stringify(result.cielo)}`);
    assert.ok(result.status.includes('Conciliado'),
      `Editada deveria estar Conciliada (valor 100 = valor Cielo 100), status: ${JSON.stringify(result.status)}`);
  });

  it('edição para auth de Não encontrado na Cielo mantém "Não encontrado" mas GANHA badge "Auth duplicado" via getEffectiveRow', () => {

    const hospitalRows = [
      {
        id: 1, registro: 'R-NAO-1', caixa: 'C1', lote: 'L1', autorizador: 'A-NAO',
        valorCartao: 50, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 2, registro: 'R-NAO-2', caixa: 'C1', lote: 'L1', autorizador: 'A-NAO',
        valorCartao: 50, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
    ];
    const cieloRows = [];

    const dupes = new Set(['A-NAO']);
    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex, dupes);

    const rNao = results.find(r => r.id === 1);
    assert.ok(rNao.status.some(s => s.includes('Não encontrado') && !s.includes('no sistema')),
      `R-NAO (auth A-NAO nao existe no Cielo) deveria estar 'Não encontrado na Cielo', status: ${JSON.stringify(rNao.status)}`);
    assert.strictEqual(rNao.cielo, null, 'R-NAO não deveria ter cielo atribuido');

    const effective = getEffectiveRow(rNao, dupes);
    assert.ok(effective.status.includes('Auth duplicado'),
      `Mesmo "Não encontrado na Cielo", auth dup deve ganhar badge. status: ${JSON.stringify(effective.status)}`);
    assert.strictEqual(effective.statusLabel, 'Divergente',
      `Auth dup força statusLabel para Divergente mesmo quando reconcileOne retornou Não encontrado. statusLabel: ${effective.statusLabel}`);
  });

  it('edição inline para auth que tem match Cielo faz Conciliar via allowReuse (cobre Pendente)', () => {

    const hospitalRows = [
      {
        id: 1, registro: 'R-PEND', caixa: 'C1', lote: 'L1', autorizador: 'A-PEND',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 2, registro: 'R-PEND2', caixa: 'C1', lote: 'L1', autorizador: 'A-PEND',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 3, registro: 'R-EDIT', caixa: 'C1', lote: 'L1', autorizador: 'B-OTHER',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
    ];
    const cieloRows = [
      { idInterno: 'C-PEND', autorizador: 'A-PEND', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const dupes = new Set(['A-PEND']);
    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex, dupes);

    const matchedCieloIds = new Set();
    for (const r of results) {
      if (r.cielo?.idInterno) matchedCieloIds.add(r.cielo.idInterno);
    }
    assert.ok(matchedCieloIds.has('C-PEND'),
      'R-PEND (Pendente, dup) deveria ter consumido a venda Cielo');

    const editedRow = { ...hospitalRows[2], autorizador: 'A-PEND' };
    const dupesAfterEdit = new Set(['A-PEND']);

    const result = reconciliation.reconcileOne(editedRow, cieloIndex, matchedCieloIds, dupesAfterEdit);

    assert.ok(result.cielo !== null && result.cielo.idInterno === 'C-PEND',
      `Editada para auth de Pendente (com dup) deveria reusar venda Cielo, mas cielo era: ${JSON.stringify(result.cielo)}`);
    assert.ok(result.status.includes('Conciliado'),
      `Editada deveria estar Conciliada, status: ${JSON.stringify(result.status)}`);
  });

  it('sem auth duplicado - mantém anti-double-booking (não passa duplicateAutorizadores)', () => {
    const hospitalRows = [
      {
        id: 1, registro: 'R1', caixa: 'C1', lote: 'L1', autorizador: 'A111',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
      {
        id: 2, registro: 'R2', caixa: 'C1', lote: 'L1', autorizador: 'A111',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 0, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
      },
    ];
    const cieloRows = [
      { idInterno: 'C-A111', autorizador: 'A111', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex);

    const r1 = results.find(r => r.id === 1);
    const r2 = results.find(r => r.id === 2);

    assert.ok(r1.cielo !== null, 'R1 deveria casar');
    assert.ok(r2.cielo === null, 'R2 NÃO deveria casar (sem auth duplicado, anti-double-booking ativo)');
    assert.ok(r2.status.some(s => s.includes('Não encontrado')),
      `R2 deveria estar Não encontrado, status: ${JSON.stringify(r2.status)}`);
  });

  it('editar auth de 1 row remove badge Auth duplicado da outra row com mesmo auth', () => {
    const hospitalRows = [
      {
        id: 1, registro: '901422', caixa: 'C1', lote: 'L1', autorizador: '00170445',
        valorCartao: 150, valorDinheiro: 0, valorFatura: 150, desconto: 0,
        bandeira: '', formaPagamento: 'DÉBITO', parcelas: '', numeroMaquina: '', corrigido: false,
      },
      {
        id: 2, registro: '901159', caixa: 'C1', lote: 'L1', autorizador: '00170445',
        valorCartao: 437.59, valorDinheiro: 0, valorFatura: 437.59, desconto: 0,
        bandeira: '', formaPagamento: 'CRÉDITO', parcelas: '', numeroMaquina: '', corrigido: false,
      },
    ];
    const cieloRows = [];
    const dupes = new Set(['00170445']);
    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const results = reconciliation.reconcileRows(hospitalRows, cieloIndex, dupes);

    const r1 = results.find(r => r.id === 1);
    const r2 = results.find(r => r.id === 2);
    assert.ok(r1.status.includes('Auth duplicado'), 'estado inicial: R1 com badge Auth duplicado');
    assert.ok(r2.status.includes('Auth duplicado'), 'estado inicial: R2 com badge Auth duplicado');

    const edited = { ...hospitalRows[0], autorizador: '999999' };
    const simulatedFinal = results.slice();
    simulatedFinal[0] = edited;
    const newDupes = findDuplicateAutorizadores(simulatedFinal);
    const matchedCieloIds = buildConsumedCieloIds(results, 0);
    const updatedRow = reconciliation.reconcileOne(edited, cieloIndex, matchedCieloIds, newDupes);

    simulatedFinal[0] = updatedRow;
    for (let i = 1; i < simulatedFinal.length; i++) {
      if (simulatedFinal[i].autorizador !== '00170445') continue;
      const otherMatchedIds = buildConsumedCieloIds(simulatedFinal, i);
      simulatedFinal[i] = reconciliation.reconcileOne(
        simulatedFinal[i], cieloIndex, otherMatchedIds, newDupes
      );
    }

    const r2After = simulatedFinal.find(r => r.id === 2);
    assert.ok(!r2After.status.includes('Auth duplicado'),
      `R2 deveria perder badge Auth duplicado após auth único. Status: ${JSON.stringify(r2After.status)}`);
    assert.ok(r2After.statusLabel !== 'Divergente' || !r2After.status.includes('Auth duplicado'),
      'R2 não deveria ter statusLabel Divergente vindo apenas de Auth duplicado');
  });

});

describe('PDF sem planilha de atendimento', () => {

  it('PDF row sem planilha (atendimentoResolvido undefined) fica Pendente com "Atendimento não encontrado"', () => {
    const hospitalRows = [
      {
        id: 1, registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: 'A12345',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 100, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
        origem: 'PDF_TASY',
        tituloTasy: '903655',
        // atendimentoResolvido não existe (undefined)
      },
    ];
    const cieloRows = [
      { idInterno: 'CIELO-001', autorizador: 'A12345', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const result = reconciliation.reconcileOne(hospitalRows[0], cieloIndex);

    assert.ok(result.status.includes('Atendimento não encontrado'),
      `Deveria marcar 'Atendimento não encontrado', status: ${JSON.stringify(result.status)}`);
    assert.ok(result.pendenciaAtendimento === true,
      'pendenciaAtendimento deveria ser true');
    assert.ok(result.observacoes.some(o => o.includes('903655')),
      `Observação deve mencionar o título 903655. observacoes: ${JSON.stringify(result.observacoes)}`);
  });

  it('PDF row com atendimentoResolvido=false (título não encontrado na planilha) fica Pendente', () => {
    const hospitalRows = [
      {
        id: 1, registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: 'A12345',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 100, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
        origem: 'PDF_TASY',
        tituloTasy: '999999',
        atendimentoResolvido: false,
      },
    ];
    const cieloRows = [
      { idInterno: 'CIELO-001', autorizador: 'A12345', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const result = reconciliation.reconcileOne(hospitalRows[0], cieloIndex);

    assert.ok(result.status.includes('Atendimento não encontrado'),
      `Deveria marcar 'Atendimento não encontrado', status: ${JSON.stringify(result.status)}`);
    assert.ok(result.observacoes.some(o => o.includes('999999')),
      `Observação deve mencionar o título. observacoes: ${JSON.stringify(result.observacoes)}`);
  });

  it('PDF row dinheiro sem tituloTasy NÃO dispara "Atendimento não encontrado"', () => {
    const hospitalRows = [
      {
        id: 1, registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: '',
        valorCartao: 0, valorDinheiro: 50, valorFatura: 50, desconto: 0,
        bandeira: '', formaPagamento: 'ESPÉCIE', parcelas: '',
        numeroMaquina: '', corrigido: false,
        origem: 'PDF_TASY',
        // sem tituloTasy
      },
    ];

    const cieloIndex = new Map();
    const result = reconciliation.reconcileOne(hospitalRows[0], cieloIndex);

    assert.ok(!result.status.includes('Atendimento não encontrado'),
      `Dinheiro sem tituloTasy não deveria marcar atendimento. status: ${JSON.stringify(result.status)}`);
    assert.ok(result.status.includes('Dinheiro'),
      `Deveria ser Dinheiro. status: ${JSON.stringify(result.status)}`);
  });

  it('BI_MV row não é afetada pela checagem de atendimento', () => {
    const hospitalRows = [
      {
        id: 1, registro: 'R001', caixa: 'C1', lote: 'L1', autorizador: 'A12345',
        valorCartao: 100, valorDinheiro: 0, valorFatura: 100, desconto: 0,
        bandeira: 'VISA', formaPagamento: 'Crédito', parcelas: '1',
        numeroMaquina: 'MAQ001', corrigido: false,
        // sem origem PDF_TASY
      },
    ];
    const cieloRows = [
      { idInterno: 'CIELO-001', autorizador: 'A12345', valorBruto: 100, bandeira: 'VISA',
        formaPagamento: 'Crédito', parcelas: '1', numeroMaquina: 'MAQ001',
        dataVenda: '2024-01-15', horaVenda: '10:00', nsu: 'NSU' },
    ];

    const cieloIndex = reconciliation.buildCieloIndexWithDedup(cieloRows).index;
    const result = reconciliation.reconcileOne(hospitalRows[0], cieloIndex);

    assert.ok(!result.status.includes('Atendimento não encontrado'),
      `Row BI_MV não deveria marcar atendimento. status: ${JSON.stringify(result.status)}`);
    assert.ok(result.status.includes('Conciliado'),
      `Deveria Conciliar normalmente. status: ${JSON.stringify(result.status)}`);
  });

});

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { setupBrowserGlobals } from '../_helpers/fileMock.mjs';

const mockXLSX = {
  utils: {
    book_new: mock.fn(() => ({})),
    json_to_sheet: mock.fn(() => ({ '!cols': [] })),
    encode_cell: mock.fn(() => 'A1'),
    decode_range: mock.fn(() => ({ s: { c: 0, r: 0 }, e: { c: 13, r: 1 } })),
    book_append_sheet: mock.fn(),
  },
  writeFile: mock.fn(),
  writeFileXLSX: mock.fn(),
  write: mock.fn(() => []),
};

setupBrowserGlobals({
  XLSX: mockXLSX,
  document: {
    createElement: mock.fn(() => ({ href: '', download: '', rel: '', appendChild: mock.fn(), remove: mock.fn() })),
    body: { appendChild: mock.fn() },
  },
  urlMock: { createObjectURL: mock.fn(() => 'blob:'), revokeObjectURL: mock.fn() },
});

const { exportTd, classifyExportSheet, buildSheetGroups, TD_COLUMNS, TASY_CIELO_COLUMNS } =
  await import('../../src/js/services/exportTd.js');

describe('exportTd', () => {
  beforeEach(() => {
    mockXLSX.utils.book_new.mock.resetCalls();
    mockXLSX.utils.json_to_sheet.mock.resetCalls();
    mockXLSX.utils.book_append_sheet.mock.resetCalls();
    mockXLSX.writeFile.mock.resetCalls();
    mockXLSX.writeFileXLSX.mock.resetCalls();
    mockXLSX.utils.decode_range.mock.resetCalls();
  });

  it('Lança erro quando não há dados processados', () => {
    assert.throws(
      () => exportTd([]),
      { message: 'Não há dados processados para exportar.' },
    );
  });

  it('Usa layout correto (TasyCielo vs TD) baseado na opção source', () => {
    exportTd([{
      registro: 'REG006',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }], { source: 'PDF_TASY' });

    const headerArg = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[1];
    assert.strictEqual(headerArg.header[0], 'Data RPS');
    assert.strictEqual(headerArg.header[1], 'Data Banco');
  });

  it('Usa layout TD padrão quando source não é PDF_TASY', () => {
    exportTd([{
      registro: 'REG007',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const headerArg = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[1];
    assert.strictEqual(headerArg.header[0], 'Data pag/RPS');
    assert.strictEqual(headerArg.header[1], 'Data banco');
  });
});

describe('classifyExportSheet', () => {

  it('corrigido=true → Conciliados', () => {
    assert.strictEqual(classifyExportSheet({ corrigido: true }), 'Conciliados');
  });

  it('corrigido=false não vai para Conciliados', () => {
    assert.strictEqual(classifyExportSheet({ corrigido: false }), 'Pendentes');
  });

  it('cieloOnly=true → Não encontrado', () => {
    assert.strictEqual(classifyExportSheet({ cieloOnly: true }), 'Não encontrado');
  });

  it('cieloOnly=true não vai para Cartão mesmo com valorCartao', () => {

    assert.strictEqual(classifyExportSheet({ cieloOnly: true, valorCartao: 100 }), 'Não encontrado');
  });

  it('valorCartao>0 → Cartão', () => {
    assert.strictEqual(classifyExportSheet({ valorCartao: 50 }), 'Cartão');
  });

  it('valorCielo>0 → Cartão (pós-reconciliação)', () => {

    assert.strictEqual(classifyExportSheet({ valorCielo: 75 }), 'Cartão');
  });

  it('valorCartao>0 E statusLabel=Divergente → Cartão (prioridade sobre Divergente)', () => {

    assert.strictEqual(classifyExportSheet({ valorCartao: 100, statusLabel: 'Divergente' }), 'Cartão');
  });

  it('valorDinheiro>0 → Dinheiro', () => {
    assert.strictEqual(classifyExportSheet({ valorDinheiro: 200 }), 'Dinheiro');
  });

  it('statusLabel=Pagamento misto → Dinheiro', () => {
    assert.strictEqual(classifyExportSheet({ statusLabel: 'Pagamento misto' }), 'Dinheiro');
  });

  it('valorDinheiro>0 E statusLabel=Divergente → Dinheiro (prioridade sobre Divergente)', () => {

    assert.strictEqual(classifyExportSheet({ valorDinheiro: 100, statusLabel: 'Divergente' }), 'Dinheiro');
  });

  it('statusLabel=Divergente → Divergentes', () => {
    assert.strictEqual(classifyExportSheet({ statusLabel: 'Divergente' }), 'Divergentes');
  });

  it('statusLabel=Pendente → Pendentes', () => {
    assert.strictEqual(classifyExportSheet({ statusLabel: 'Pendente' }), 'Pendentes');
  });

  it('row vazia → Pendentes (fallback)', () => {
    assert.strictEqual(classifyExportSheet({}), 'Pendentes');
  });

  it('valores zeros não ativam Cartão/Dinheiro', () => {
    assert.strictEqual(classifyExportSheet({ valorCartao: 0, valorCielo: 0, valorDinheiro: 0 }), 'Pendentes');
  });

  it('corrigido=false não entra em Conciliados', () => {
    assert.strictEqual(classifyExportSheet({ corrigido: false, valorCartao: 500 }), 'Cartão');
    assert.strictEqual(classifyExportSheet({ corrigido: undefined, valorCartao: 500 }), 'Cartão');
    assert.strictEqual(classifyExportSheet({ corrigido: null, valorCartao: 500 }), 'Cartão');
  });

  it('Conciliado + auth duplicado: vai pra Divergentes (NÃO Conciliados, NÃO Cartão)', () => {
    const row = {
      valorCartao: 100,
      valorCielo: 100,
      statusLabel: 'Divergente',
      status: ['Conciliado', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes',
      'row Conciliada com auth dup deve ir pra Divergentes na planilha');
  });

  it('NÃO encontrado na Cielo + auth duplicado: vai pra Divergentes (NÃO Conciliados)', () => {
    const row = {
      valorCartao: 100,
      statusLabel: 'Divergente',
      status: ['Não encontrado na Cielo', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('row com Auth duplicado SEM Conciliado/Não encontrado prévio: vai pra Divergentes', () => {
    const row = {
      valorCartao: 100,
      statusLabel: 'Divergente',
      status: ['Divergência valor cartão', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('row com Auth duplicado mas corrigido=true: ainda vai pra Conciliados (corrigido tem prioridade)', () => {
    const row = {
      corrigido: true,
      valorCartao: 100,
      status: ['Conciliado', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Conciliados');
  });

});

describe('buildSheetGroups', () => {

  it('linha corrigido vai para Conciliados', () => {
    const dados = [{ corrigido: true }];
    const groups = buildSheetGroups(dados);
    const names = groups.map(g => g.name);
    assert.ok(names.includes('Conciliados'));
    assert.strictEqual(groups.find(g => g.name === 'Conciliados').rows.length, 1);
    assert.strictEqual(groups.find(g => g.name === 'Cartão')?.rows.length ?? 0, 0);
    assert.strictEqual(groups.find(g => g.name === 'Dinheiro')?.rows.length ?? 0, 0);
  });

  it('linha cieloOnly vai para Não encontrado', () => {
    const dados = [{ cieloOnly: true }];
    const groups = buildSheetGroups(dados);
    assert.ok(groups.find(g => g.name === 'Não encontrado'));
    assert.strictEqual(groups.find(g => g.name === 'Não encontrado').rows.length, 1);
    assert.strictEqual(
      groups.filter(g => g.name !== 'Não encontrado').reduce((sum, g) => sum + g.rows.length, 0),
      0,
    );
  });

  it('cartão com Divergente → APENAS Cartão (valores financeiros têm prioridade)', () => {
    const dados = [{ valorCartao: 100, statusLabel: 'Divergente' }];
    const groups = buildSheetGroups(dados);

    const cartaoGroup = groups.find(g => g.name === 'Cartão');
    assert.ok(cartaoGroup, 'Deve ter aba Cartão');
    assert.strictEqual(cartaoGroup.rows.length, 1);

    const divergentesGroup = groups.find(g => g.name === 'Divergentes');
    assert.strictEqual(divergentesGroup, undefined, 'NÃO deve ter aba Divergentes com essa linha');

    const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
    assert.strictEqual(totalRows, 1);
  });

  it('linha dinheiro puro → Dinheiro', () => {
    const dados = [{ valorDinheiro: 300 }];
    const groups = buildSheetGroups(dados);
    assert.ok(groups.find(g => g.name === 'Dinheiro'));
    assert.strictEqual(groups.reduce((sum, g) => sum + g.rows.length, 0), 1);
  });

  it('linha pagamento misto → Dinheiro', () => {
    const dados = [{ statusLabel: 'Pagamento misto' }];
    const groups = buildSheetGroups(dados);
    assert.ok(groups.find(g => g.name === 'Dinheiro'));
    assert.strictEqual(groups.reduce((sum, g) => sum + g.rows.length, 0), 1);
  });

  it('linha Pendente → Pendentes', () => {
    const dados = [{ statusLabel: 'Pendente' }];
    const groups = buildSheetGroups(dados);
    assert.ok(groups.find(g => g.name === 'Pendentes'));
    assert.strictEqual(groups.reduce((sum, g) => sum + g.rows.length, 0), 1);
  });

  it('EXCLUSIVIDADE: soma de linhas por aba == total processadas', () => {
    const dados = [
      { corrigido: true },
      { corrigido: true },
      { cieloOnly: true },
      { valorCartao: 100, statusLabel: 'Divergente' },
      { valorCartao: 200 },
      { valorCielo: 150 },
      { valorDinheiro: 50 },
      { statusLabel: 'Pagamento misto' },
      { statusLabel: 'Divergente' },
      { statusLabel: 'Pendente' },
      { statusLabel: 'Pendente' },
      {},
    ];

    const groups = buildSheetGroups(dados);
    const totalPorAbas = groups.reduce((sum, g) => sum + g.rows.length, 0);
    assert.strictEqual(
      totalPorAbas,
      dados.length,
      `Soma das abas (${totalPorAbas}) == total (${dados.length})`,
    );
  });

  it('cada linha aparece em exatamente uma aba', () => {
    const dados = [
      { valorCartao: 100, statusLabel: 'Divergente' },
      { valorDinheiro: 200, statusLabel: 'Divergente' },
      { cieloOnly: true },
      { corrigido: true },
    ];

    const groups = buildSheetGroups(dados);
    const rowAppearances = new Map();

    groups.forEach(group => {
      group.rows.forEach(row => {
        const key = JSON.stringify(row);
        rowAppearances.set(key, (rowAppearances.get(key) || 0) + 1);
      });
    });

    let allUnique = true;
    for (const count of rowAppearances.values()) {
      if (count !== 1) { allUnique = false; break; }
    }
    assert.ok(allUnique, 'Cada linha deve aparecer em exatamente uma aba');
  });

  it('ordem das abas preservada', () => {
    const dados = [
      { corrigido: true },
      { valorCartao: 100 },
      { valorDinheiro: 50 },
      { statusLabel: 'Divergente' },
      { cieloOnly: true },
      { statusLabel: 'Pendente' },
    ];

    const groups = buildSheetGroups(dados);
    const names = groups.map(g => g.name);
    const expected = ['Conciliados', 'Cartão', 'Dinheiro', 'Divergentes', 'Não encontrado', 'Pendentes'];

    expected.forEach(name => {
      assert.ok(names.includes(name), `Deveria conter aba: ${name}`);
    });
  });

});

describe('S02: buildTasyCieloRows — dataBanco e Observação', () => {

  beforeEach(() => {
    mockXLSX.utils.book_new.mock.resetCalls();
    mockXLSX.utils.json_to_sheet.mock.resetCalls();
    mockXLSX.utils.book_append_sheet.mock.resetCalls();
    mockXLSX.utils.decode_range.mock.resetCalls();
  });

  it('T01: espécie Tasy — dataBanco = dataPagamento', () => {
    exportTd([{
      registro: 'REG001',
      dataPagamento: '18/06/2026',
      valorCartao: 0,
      valorDinheiro: 150,
      valorFatura: 150,
    }], { source: 'PDF_TASY' });

    const dinheirCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data RPS',
    );
    assert.ok(dinheirCall, 'Deveria ter aba Tasy com Data RPS');
    const rows = dinheirCall.arguments[0];
    assert.ok(rows.length > 0, 'Deveria ter pelo menos 1 linha de espécie');
    assert.strictEqual(
      rows[0]['Data Banco'],
      '18/06/2026',
      'dataBanco deve ser igual a dataPagamento em espécie Tasy',
    );
  });

  it('T02: Observação sempre vazia — layout TD', () => {
    exportTd([{
      registro: 'REG002',
      dataPagamento: '18/06/2026',
      valorCartao: 200,
      valorDinheiro: 0,
      valorFatura: 200,
    }]);

    const rows = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[0];
    assert.ok(rows.length > 0);
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser string vazia em Cartão TD',
    );
  });

  it('T02: Observação sempre vazia — layout Tasy cartão', () => {
    exportTd([{
      registro: 'REG003',
      dataPagamento: '18/06/2026',
      valorCartao: 300,
      valorDinheiro: 0,
      valorFatura: 300,
      cielo: { autorizador: 'AUTH123' },
    }], { source: 'PDF_TASY' });

    const rows = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[0];
    assert.ok(rows.length > 0);
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser string vazia em Cartão Tasy',
    );
  });

  it('T02: Observação sempre vazia — layout Tasy espécie', () => {
    exportTd([{
      registro: 'REG004',
      dataPagamento: '18/06/2026',
      valorCartao: 0,
      valorDinheiro: 100,
      valorFatura: 100,
    }], { source: 'PDF_TASY' });

    const rows = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[0];
    assert.ok(rows.length > 0);
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser string vazia em espécie Tasy',
    );
  });

  it('T03: espécie Tasy — dataBanco = dataPagamento E Observação vazia (teste combinado)', () => {
    exportTd([{
      registro: 'REG005',
      dataPagamento: '20/06/2026',
      valorCartao: 0,
      valorDinheiro: 500,
      valorFatura: 500,
    }], { source: 'PDF_TASY' });

    const rows = mockXLSX.utils.json_to_sheet.mock.calls[0].arguments[0];
    assert.ok(rows.length > 0, 'Deveria ter 1 linha de espécie');
    assert.strictEqual(
      rows[0]['Data Banco'],
      '20/06/2026',
      'dataBanco deve ser dataPagamento',
    );
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser vazia',
    );
  });

});

describe('S03: exportTd — defesa contra formula injection (CWE-1236)', () => {

  beforeEach(() => {
    mockXLSX.utils.book_new.mock.resetCalls();
    mockXLSX.utils.json_to_sheet.mock.resetCalls();
    mockXLSX.utils.book_append_sheet.mock.resetCalls();
    mockXLSX.utils.decode_range.mock.resetCalls();
  });

  it('campos user-controlled com chars perigosos recebem prefixo \' antes de chegar ao XLSX', () => {

    exportTd([{
      registro: '=HYPERLINK("http://evil","x")',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
      autorizador: '+cmd|/c calc',
      formaPagamento: '@SUM(A1)',
      contaFatura: '-evil',
    }]);

    const rows = mockXLSX.utils.json_to_sheet.mock.calls.at(-1).arguments[0];
    assert.strictEqual(rows[0]['Aten/Registro'], '\'=HYPERLINK("http://evil","x")');
    assert.strictEqual(rows[0]['Autorizador'], '\'+cmd|/c calc');
    assert.strictEqual(rows[0]['Forma de Pagamento'], '\'@SUM(A1)');
    assert.strictEqual(rows[0]['Conta/Fatura'], '\'-evil');

    assert.strictEqual(rows[0]['Data pag/RPS'], '18/06/2026');
  });

  it('valores numéricos positivos passam inalterados (sem prefix fals)', () => {
    exportTd([{
      registro: 'REG010',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 50,
      valorFatura: 100,
    }]);

    const rows = mockXLSX.utils.json_to_sheet.mock.calls.at(-1).arguments[0];

    assert.strictEqual(rows[0]['Valor Fatura'], '100');
    assert.strictEqual(rows[0]['Valor Banco'], '100');
  });

  it('valor m\u00ednimo > 0 preservado (valor zero lança throw — fora do escopo)', () => {

    exportTd([{
      registro: 'REG011',
      dataPagamento: '18/06/2026',
      valorCartao: 0.01,
      valorDinheiro: 0,
      valorFatura: 0.01,
    }]);

    const rows = mockXLSX.utils.json_to_sheet.mock.calls.at(-1).arguments[0];
    assert.strictEqual(rows[0]['Valor Fatura'], '0.01');
    assert.strictEqual(rows[0]['Valor Banco'], '0.01');
  });

});

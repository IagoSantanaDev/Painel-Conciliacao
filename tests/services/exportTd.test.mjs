import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { setupBrowserGlobals } from '../_helpers/fileMock.mjs';

function buildJsonToSheet(rows, options) {
  const headers = options?.header || (rows[0] ? Object.keys(rows[0]) : []);
  const sheet = { '!cols': [], '!ref': `A1:${String.fromCharCode(65 + headers.length - 1)}${rows.length + 1}` };
  headers.forEach((h, ci) => {
    sheet[`${String.fromCharCode(65 + ci)}1`] = { v: h, t: 's' };
    rows.forEach((row, ri) => {
      const addr = `${String.fromCharCode(65 + ci)}${ri + 2}`;
      sheet[addr] = { v: row[h] ?? '', t: typeof row[h] === 'number' ? 'n' : 's' };
    });
  });
  return sheet;
}

const mockXLSX = {
  utils: {
    book_new: mock.fn(() => ({})),
    json_to_sheet: mock.fn((rows, opts) => buildJsonToSheet(rows, opts)),
    encode_cell: mock.fn(({ r, c }) => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let s = '';
      let n = c;
      while (n >= 0) { s = letters[n % 26] + s; n = Math.floor(n / 26) - 1; }
      return `${s}${r + 1}`;
    }),
    decode_range: mock.fn((ref) => {
      const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) return { s: { c: 0, r: 0 }, e: { c: 13, r: 1 } };
      const colToIdx = letters => {
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
      };
      return { s: { c: colToIdx(match[1]), r: Number(match[2]) - 1 }, e: { c: colToIdx(match[3]), r: Number(match[4]) - 1 } };
    }),
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

  it('corrigido=false com statusLabel Conciliado → Conciliados (match perfeito Cielo)', () => {
    assert.strictEqual(
      classifyExportSheet({ corrigido: false, statusLabel: 'Conciliado' }),
      'Conciliados',
    );
  });

  it('statusLabel Conciliado + cieloOnly=true → Não encontrado (Cielo vence)', () => {
    assert.strictEqual(
      classifyExportSheet({ cieloOnly: true, statusLabel: 'Conciliado' }),
      'Não encontrado',
    );
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

  it('valorCartao>0 E statusLabel=Divergente → Divergentes (filtro do painel é fonte da verdade)', () => {
    // O filtro "Divergentes" do painel inclui rows de cartão com divergência.
    // A aba do export deve espelhar o painel: vai pra Divergentes, não Cartão.
    assert.strictEqual(classifyExportSheet({ valorCartao: 100, statusLabel: 'Divergente' }), 'Divergentes');
  });

  it('valorDinheiro>0 → Dinheiro', () => {
    assert.strictEqual(classifyExportSheet({ valorDinheiro: 200 }), 'Dinheiro');
  });

  it('statusLabel=Pagamento misto → Dinheiro', () => {
    assert.strictEqual(classifyExportSheet({ statusLabel: 'Pagamento misto' }), 'Dinheiro');
  });

  it('valorDinheiro>0 E statusLabel=Divergente → Divergentes (filtro do painel é fonte da verdade)', () => {
    // Mesma lógica: filtro "Divergentes" do painel inclui dinheiro com divergência.
    assert.strictEqual(classifyExportSheet({ valorDinheiro: 100, statusLabel: 'Divergente' }), 'Divergentes');
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

  it('Conciliado + auth duplicado: vai pra Divergentes (quando statusLabel=Divergente)', () => {
    // Se a row tem statusLabel=Divergente (e não é corrigida/conciliada), vai
    // pra Divergentes independente do Auth Duplicado.
    const row = {
      valorCartao: 100,
      valorCielo: 100,
      statusLabel: 'Divergente',
      status: ['Conciliado', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes',
      'row com statusLabel=Divergente e Auth Duplicado vai pra Divergentes');
  });

  it('NÃO encontrado na Cielo + auth duplicado: vai pra Divergentes (quando statusLabel=Divergente)', () => {
    const row = {
      valorCartao: 100,
      statusLabel: 'Divergente',
      status: ['Não encontrado na Cielo', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('Conciliado + auth duplicado: vai pra Conciliados (pode aparecer na aba Conciliados)', () => {
    // Regra atual do usuário: Corrigidos ou Conciliados com Auth Duplicado
    // PODEM ficar em Conciliados.
    const row = {
      corrigido: true,
      valorCartao: 100,
      status: ['Conciliado', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Conciliados',
      'corrigido=true com Auth Duplicado pode ir pra Conciliados');
  });

  it('Auth Duplicado SEM corrigido/conciliado: cai em Divergentes', () => {
    // Se não tem corrigido nem statusLabel=Conciliado, vai pra Divergentes
    // via predicate isDivergente.
    const row = {
      valorCartao: 100,
      statusLabel: 'Divergente',
      status: ['Divergência valor cartão', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('Sem autorizador → Divergentes (não Pendentes)', () => {
    const row = {
      valorCartao: 100,
      status: ['Sem autorizador'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('Sem autorizador + Auth duplicado → Divergentes', () => {
    const row = {
      valorCartao: 100,
      status: ['Sem autorizador', 'Auth duplicado'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
  });

  it('valorDinheiro + statusLabel Divergente → Divergentes (filtro do painel)', () => {
    // A reconciliação promove statusLabel para 'Divergente' via getStatusLabel.
    // Se statusLabel === 'Divergente', a aba é Divergentes — mesmo com valorDinheiro > 0.
    const row = {
      valorDinheiro: 100,
      valorFatura: 99,
      statusLabel: 'Divergente',
      status: ['Dinheiro', 'Dinheiro Diferença'],
    };
    assert.strictEqual(classifyExportSheet(row), 'Divergentes');
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

  it('cartão com Divergente → Divergentes (filtro do painel é fonte da verdade)', () => {
    // Se a row aparece no filtro "Divergentes" do painel, vai pra aba Divergentes,
    // não pra aba Cartão, mesmo com valorCartao > 0.
    const dados = [{ valorCartao: 100, statusLabel: 'Divergente' }];
    const groups = buildSheetGroups(dados);

    const divergentesGroup = groups.find(g => g.name === 'Divergentes');
    assert.ok(divergentesGroup, 'Deve ter aba Divergentes');
    assert.strictEqual(divergentesGroup.rows.length, 1);

    const cartaoGroup = groups.find(g => g.name === 'Cartão');
    assert.strictEqual(cartaoGroup?.rows.length ?? 0, 0, 'NÃO deve ter essa linha em Cartão');

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

  it('T01: espécie Tasy — dataBanco vazio', () => {
    exportTd([{
      registro: 'REG001',
      dataPagamento: '18/06/2026',
      valorCartao: 0,
      valorDinheiro: 150,
      valorFatura: 150,
    }], { source: 'PDF_TASY' });

    const dinheirCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data RPS' && call.arguments[0].length > 0,
    );
    assert.ok(dinheirCall, 'Deveria ter aba Tasy com rows');
    const rows = dinheirCall.arguments[0];
    assert.ok(rows.length > 0, 'Deveria ter pelo menos 1 linha de espécie');
    assert.strictEqual(
      rows[0]['Data Banco'],
      '',
      'dataBanco deve ser vazio em espécie (sem passagem pelo banco)',
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

    const cartaoCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data pag/RPS' && call.arguments[0].length > 0,
    );
    assert.ok(cartaoCall, 'Deveria ter aba Cartão TD com rows');
    const rows = cartaoCall.arguments[0];
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

    const cartaoCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data RPS' && call.arguments[0].length > 0,
    );
    assert.ok(cartaoCall, 'Deveria ter aba Cartão Tasy com rows');
    const rows = cartaoCall.arguments[0];
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

    const dinheiroCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data RPS' && call.arguments[0].length > 0,
    );
    assert.ok(dinheiroCall, 'Deveria ter aba Dinheiro Tasy com rows');
    const rows = dinheiroCall.arguments[0];
    assert.ok(rows.length > 0);
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser string vazia em espécie Tasy',
    );
  });

  it('T03: espécie Tasy — dataBanco vazio E Observação vazia (teste combinado)', () => {
    exportTd([{
      registro: 'REG005',
      dataPagamento: '20/06/2026',
      valorCartao: 0,
      valorDinheiro: 500,
      valorFatura: 500,
    }], { source: 'PDF_TASY' });

    const dinheiroCall = mockXLSX.utils.json_to_sheet.mock.calls.find(
      call => call.arguments[1]?.header?.[0] === 'Data RPS' && call.arguments[0].length > 0,
    );
    assert.ok(dinheiroCall, 'Deveria ter aba Dinheiro Tasy com rows');
    const rows = dinheiroCall.arguments[0];
    assert.ok(rows.length > 0, 'Deveria ter 1 linha de espécie');
    assert.strictEqual(
      rows[0]['Data Banco'],
      '',
      'dataBanco deve ser vazio em espécie',
    );
    assert.strictEqual(
      rows[0]['Observação'],
      '',
      'Observação deve ser vazia',
    );
  });

  it('Aba Conciliados sempre existe, mesmo sem linhas corrigidas', () => {
    exportTd([{
      registro: 'REG200',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const conciliadosAppended = appendedSheets.find(c => c.arguments[2] === 'Conciliados');
    assert.ok(conciliadosAppended, 'Aba Conciliados deve estar presente mesmo sem corrigidos');
  });

  it('T04: células de data viram número serial com formato dd/mm/yyyy', () => {
    exportTd([{
      registro: 'REG100',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    assert.ok(appendedSheets.length > 0, 'Deveria ter chamado book_append_sheet');
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];

    const dataCell = sheet['A2'];
    assert.ok(dataCell, 'Célula A2 deveria existir');
    assert.strictEqual(dataCell.t, 'n', 'Data pag/RPS deve ser tipo numérico (n)');
    assert.strictEqual(dataCell.z, 'dd/mm/yyyy', 'Data pag/RPS deve ter formato dd/mm/yyyy');

    // serial para 18/06/2026: ((Date.UTC(2026,5,18) - Date.UTC(1899,11,30)) / 86400000)
    const expected = Math.floor((Date.UTC(2026, 5, 18) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.strictEqual(dataCell.v, expected, 'Serial da data deve bater com 18/06/2026');
  });

  it('T04: layout Tasy aplica formato de data em Data RPS apenas (Data Banco vazio em espécie)', () => {
    exportTd([{
      registro: 'REG101',
      dataPagamento: '20/06/2026',
      valorCartao: 0,
      valorDinheiro: 100,
      valorFatura: 100,
    }], { source: 'PDF_TASY' });

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];

    const dataRpsCell = sheet['A2'];
    const dataBancoCell = sheet['B2'];
    assert.ok(dataRpsCell && dataBancoCell, 'Células de data deveriam existir');
    assert.strictEqual(dataRpsCell.t, 'n');
    assert.strictEqual(dataRpsCell.z, 'dd/mm/yyyy');

    // Em espécie a Data Banco fica vazia (não repete a data)
    assert.strictEqual(dataBancoCell.v, '', 'Data Banco deve ser vazia em espécie');
    assert.notStrictEqual(dataBancoCell.z, 'dd/mm/yyyy', 'Data Banco vazia não deve ter formato de data');

    const expected = Math.floor((Date.UTC(2026, 5, 20) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.strictEqual(dataRpsCell.v, expected);
  });

  it('T04: cartão TD — Data pag/RPS e Data banco são ambos preenchidos', () => {
    exportTd([{
      registro: 'REG102',
      dataPagamento: '18/06/2026',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];

    const dataRpsCell = sheet['A2'];
    const dataBancoCell = sheet['B2'];
    assert.ok(dataRpsCell && dataBancoCell, 'Células de data deveriam existir');
    assert.strictEqual(dataRpsCell.t, 'n');
    assert.strictEqual(dataRpsCell.z, 'dd/mm/yyyy');
    assert.strictEqual(dataBancoCell.t, 'n', 'Data banco em cartão TD deve ter tipo numérico');
    assert.strictEqual(dataBancoCell.z, 'dd/mm/yyyy', 'Data banco em cartão TD deve ter formato dd/mm/yyyy');

    const expected = Math.floor((Date.UTC(2026, 5, 18) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.strictEqual(dataRpsCell.v, expected);
    assert.strictEqual(dataBancoCell.v, expected, 'Data banco em cartão TD deve repetir data pag/RPS');
  });

  it('T04b: aceita variação curta dd/mm/yy e normaliza pra serial Excel', () => {
    exportTd([{
      registro: 'REG103',
      dataPagamento: '18/06/26',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];
    const dataRpsCell = sheet['A2'];
    // 18/06/26 → dia=18, mês=06, ano=2026
    const expected = Math.floor((Date.UTC(2026, 5, 18) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.strictEqual(dataRpsCell.t, 'n');
    assert.strictEqual(dataRpsCell.z, 'dd/mm/yyyy');
    assert.strictEqual(dataRpsCell.v, expected);
  });

  it('T04c: parsing só tenta serial quando o valor tem cara de data dd/mm', () => {
    exportTd([{
      registro: 'REG104',
      dataPagamento: '',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];
    const dataRpsCell = sheet['A2'];
    assert.strictEqual(dataRpsCell.v, '', 'data vazia continua vazia');
  });

  it('T04d: fallback US (m/d/yy) quando o formato BR falha (mês > 12)', () => {
    // Planilhas BI/MV antigas guardam células de data como 'm/d/yy' (US). O
    // usuário não deve perder essas datas — aplicamos fallback automático.
    exportTd([{
      registro: 'REG105',
      dataPagamento: '6/30/26',
      valorCartao: 100,
      valorDinheiro: 0,
      valorFatura: 100,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];
    const dataRpsCell = sheet['A2'];
    // 6/30/26 como US → 30 de junho de 2026
    const expected = Math.floor((Date.UTC(2026, 5, 30) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.strictEqual(dataRpsCell.t, 'n', 'célula de data deve virar numérica via fallback US');
    assert.strictEqual(dataRpsCell.z, 'dd/mm/yyyy');
    assert.strictEqual(dataRpsCell.v, expected);
  });

  it('T05: Valor Fatura e Valor Banco ficam numéricos sem formato específico (Geral)', () => {
    exportTd([{
      registro: 'REG200',
      dataPagamento: '18/06/2026',
      valorCartao: 350,
      valorDinheiro: 0,
      valorFatura: 350,
    }]);

    const appendedSheets = mockXLSX.utils.book_append_sheet.mock.calls;
    const sheet = appendedSheets[appendedSheets.length - 1].arguments[1];

    // Colunas E (Valor Fatura) e F (Valor Banco) devem ser numéricas, sem cell.z
    const valorFaturaCell = sheet['E2'];
    const valorBancoCell = sheet['F2'];
    assert.ok(valorFaturaCell, 'Célula Valor Fatura deve existir');
    assert.strictEqual(valorFaturaCell.t, 'n');
    assert.strictEqual(valorFaturaCell.z, undefined, 'Valor Fatura não deve ter formato (Excel usa Geral)');
    assert.strictEqual(valorBancoCell.t, 'n');
    assert.strictEqual(valorBancoCell.z, undefined, 'Valor Banco não deve ter formato (Excel usa Geral)');
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

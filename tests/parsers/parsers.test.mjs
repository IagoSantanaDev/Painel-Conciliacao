
import { describe, it } from 'node:test';
import assert from 'node:assert';
import Papa from 'papaparse';
import { mockCsvFile, makeXlsxSandbox, setupBrowserGlobals, teardownBrowserGlobals } from '../_helpers/fileMock.mjs';

setupBrowserGlobals({ XLSX: makeXlsxSandbox({ withDocument: false }), Papa });

const { parseBiMv } = await import('../../src/js/parsers/biMvParser.js');
const { parseCielo } = await import('../../src/js/parsers/cieloParser.js');

process.on('exit', teardownBrowserGlobals);

const BI_MV_CSV = [
  'Número Registro;Lote;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorização',
  'REG001;L001;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;CAIXA01;AUTH001',
  'REG002;L001;18/06/2026;R$ 200,00;R$ 0,00;R$ 200,00;MASTERCARD;CRÉDITO;CAIXA01;AUTH002',
  'REG003;L002;18/06/2026;R$ 0,00;R$ 150,00;R$ 150,00;ELO;ESPÉCIE;CAIXA02;',
  'REG004;L002;18/06/2026;R$ 300,00;R$ 0,00;R$ 300,00;VISA;CRÉDITO;CAIXA01;AUTH003',
  'REG005;L003;19/06/2026;R$ 50,00;R$ 0,00;R$ 50,00;AMEX;DÉBITO;CAIXA03;AUTH004',
].join('\n');

const CIELO_CSV = [
  'Código de autorização;Data da venda;Valor bruto;Quantidade de parcelas;Forma de pagamento;Bandeira;Número da máquina',
  'AUTH100;18/06/2026;150,00;3;CRÉDITO;VISA;001',
  'AUTH101;18/06/2026;200,00;1;CRÉDITO;MASTERCARD;002',
  'AUTH102;19/06/2026;80,00;2;CRÉDITO;ELO;003',
  'AUTH103;19/06/2026;500,00;6;CRÉDITO;VISA;004',
].join('\n');

describe('parseBiMv', () => {

  it('parseBiMv processa CSV e produz campos obrigatórios', async () => {
    const result = await parseBiMv(mockCsvFile(BI_MV_CSV));
    const rows = result.rows;

    assert.ok(Array.isArray(rows), 'deve retornar array de rows');
    assert.ok(rows.length >= 3, 'deve ter pelo menos 3 linhas processadas');

    const first = rows[0];
    assert.ok('registro' in first, 'deve ter campo registro');
    assert.ok('autorizador' in first, 'deve ter campo autorizador');
    assert.ok('valorCartao' in first, 'deve ter campo valorCartao');
    assert.ok('valorDinheiro' in first, 'deve ter campo valorDinheiro');
    assert.ok('valorFatura' in first, 'deve ter campo valorFatura');
    assert.ok('dataPagamento' in first, 'deve ter campo dataPagamento');
  });

  it('parseBiMv: valores monetários parseados corretamente', async () => {
    const result = await parseBiMv(mockCsvFile(BI_MV_CSV));
    const rows = result.rows;

    const cartaoRow = rows.find(r => r.registro === 'REG001');
    assert.ok(cartaoRow, 'REG001 deve existir');
    assert.strictEqual(cartaoRow.valorCartao, 100, 'valorCartao = 100');
    assert.strictEqual(cartaoRow.valorDinheiro, 0, 'valorDinheiro = 0');
  });

  it('parseBiMv: linhas sem registro nem valores são descartadas', async () => {
    const csvWithEmpty = [
      'Número Registro;Lote;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorização',
      ';;;;;;;',
      'REG001;L001;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;CAIXA01;AUTH001',
    ].join('\n');
    const result = await parseBiMv(mockCsvFile(csvWithEmpty));
    const rows = result.rows;

    const withRegistro = rows.filter(r => r.registro);
    assert.ok(withRegistro.length >= 1, 'pelo menos REG001 deve estar presente');
  });

  it('parseBiMv: dedup remove linhas idênticas', async () => {
    const csvDuplicado = [
      'Número Registro;Lote;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorização',
      'REG001;L001;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;CAIXA01;AUTH001',
      'REG001;L001;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;CAIXA01;AUTH001',
    ].join('\n');
    const result = await parseBiMv(mockCsvFile(csvDuplicado));
    const rows = result.rows;
    assert.strictEqual(rows.length, 1, 'linha duplicada exata deve ser removida');
  });

  it('parseBiMv: dinheiro puro preserva valorDinheiro', async () => {
    const result = await parseBiMv(mockCsvFile(BI_MV_CSV));
    const rows = result.rows;

    const dinheiroRow = rows.find(r => r.registro === 'REG003');
    assert.ok(dinheiroRow, 'REG003 (dinheiro) deve existir');
    assert.strictEqual(dinheiroRow.valorDinheiro, 150, 'valorDinheiro = 150');
  });

  it('parseBiMv: prefere coluna "Autorizador" pura sobre "Autorizador Doc."', async () => {
    const csv = [
      'Número Registro;Lote;Autorizador Doc.;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorizador',
      'REG100;17;17-360-046387;18/06/2026;R$ 0,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;360;046387',
    ].join('\n');
    const result = await parseBiMv(mockCsvFile(csv));
    const row = result.rows.find(r => r.registro === 'REG100');
    assert.ok(row, 'REG100 deve existir');
    assert.strictEqual(row.autorizador, '046387',
      'autorizador puro deve prevalecer sobre "Autorizador Doc." concatenado');
    assert.notStrictEqual(row.autorizador, '17-360-046387',
      'NÃO deve concatenar Lote-Caixa-NSU como autorizador');
    assert.strictEqual(row.autorizadorDoc, '17-360-046387',
      'campo autorizadorDoc deve preservar o DOC bruto (Lote-Caixa-NSU)');
  });

  it('parseBiMv: dedup distingue linhas por Autorizador Doc.', async () => {
    const csv = [
      'Número Registro;Lote;Autorizador Doc.;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorizador',
      'REG200;17;17-360-046387;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;360;046387',
      'REG200;17;17-360-046388;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;360;046388',
    ].join('\n');
    const result = await parseBiMv(mockCsvFile(csv));
    assert.strictEqual(result.rows.length, 2,
      'linhas com Autorizador Doc. diferente devem ser preservadas (não dedupadas)');
  });

  it('parseBiMv: dedup colapsa linhas idênticas incluindo Autorizador Doc.', async () => {
    const csv = [
      'Número Registro;Lote;Autorizador Doc.;Data Pagamento;Valor Cartão;Valor Dinheiro;Valor Fatura;Bandeira;Débito/Crédito;Caixa;Autorizador',
      'REG300;17;17-360-046387;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;360;046387',
      'REG300;17;17-360-046387;18/06/2026;R$ 100,00;R$ 0,00;R$ 100,00;VISA;CRÉDITO;360;046387',
    ].join('\n');
    const result = await parseBiMv(mockCsvFile(csv));
    assert.strictEqual(result.rows.length, 1,
      'linhas totalmente idênticas (incluindo Autorizador Doc.) devem colapsar em 1');
  });

});

describe('parseCielo', () => {

  it('parseCielo processa CSV e produz campos obrigatórios', async () => {
    const result = await parseCielo(mockCsvFile(CIELO_CSV));

    const rows = result.rows;
    assert.ok(Array.isArray(rows), 'deve retornar objeto com rows array');
    assert.ok(rows.length >= 3, 'deve ter pelo menos 3 linhas processadas');

    const first = rows[0];
    assert.ok('autorizador' in first, 'deve ter campo autorizador');
    assert.ok('valorBruto' in first, 'deve ter campo valorBruto');
    assert.ok('bandeira' in first, 'deve ter campo bandeira');
  });

  it('parseCielo: valores parseados corretamente', async () => {
    const result = await parseCielo(mockCsvFile(CIELO_CSV));
    const row = result.rows.find(r => r.autorizador === 'AUTH100');

    assert.ok(row, 'AUTH100 deve existir');
    assert.strictEqual(row.autorizador, 'AUTH100', 'autorizador = AUTH100');
    assert.strictEqual(row.valorBruto, 150, 'valorBruto = 150');
    assert.strictEqual(row.bandeira, 'VISA', 'bandeira = VISA');
  });

  it('parseCielo: múltiplas linhas processadas', async () => {
    const result = await parseCielo(mockCsvFile(CIELO_CSV));
    assert.ok(result.rows.length >= 4, 'deve processar pelo menos 4 linhas');
  });

  it('parseCielo: CSV vazio lança erro de cabeçalho', async () => {
    const emptyCsv = 'Código de autorização;Data da venda;Valor bruto;Quantidade de parcelas;Forma de pagamento;Bandeira;Número da máquina\n';
    await assert.rejects(
      () => parseCielo(mockCsvFile(emptyCsv)),
      /cabeçalho|autorização/i,
    );
  });

});

describe('dedup cross-source', () => {

  it('deduplicateHospitalRows remove duplicados exatos entre linhas', async () => {
    const { deduplicateHospitalRows } = await import('../../src/js/utils/dedupe.js');

    const duplicateRows = [
      { atendimento: '', tituloTasy: '', dataPagamento: '18/06/2026', horaPagamento: '', autorizador: 'AUTH001', autorizadorDoc: '', valorCartao: 100, valorDinheiro: 0, valorFatura: 100, bandeira: 'VISA', formaPagamento: 'CRÉDITO', parcelas: '', contaFatura: 'F001', caixa: '', lote: '' },
      { atendimento: '', tituloTasy: '', dataPagamento: '18/06/2026', horaPagamento: '', autorizador: 'AUTH001', autorizadorDoc: '', valorCartao: 100, valorDinheiro: 0, valorFatura: 100, bandeira: 'VISA', formaPagamento: 'CRÉDITO', parcelas: '', contaFatura: 'F001', caixa: '', lote: '' },
    ];

    const result = deduplicateHospitalRows(duplicateRows);
    assert.strictEqual(result.length, 1, 'linhas idênticas devem ser deduplicadas');
  });

  it('deduplicateHospitalRows preserva linhas com campos-identidade diferentes', async () => {
    const { deduplicateHospitalRows } = await import('../../src/js/utils/dedupe.js');

    const distinctRows = [
      { atendimento: 'REG001', tituloTasy: '', dataPagamento: '18/06/2026', horaPagamento: '', autorizador: 'AUTH001', autorizadorDoc: '', valorCartao: 100, valorDinheiro: 0, valorFatura: 100, bandeira: 'VISA', formaPagamento: 'CRÉDITO', parcelas: '', contaFatura: 'F001', caixa: '', lote: '' },
      { atendimento: 'REG002', tituloTasy: '', dataPagamento: '18/06/2026', horaPagamento: '', autorizador: 'AUTH001', autorizadorDoc: '', valorCartao: 100, valorDinheiro: 0, valorFatura: 100, bandeira: 'VISA', formaPagamento: 'CRÉDITO', parcelas: '', contaFatura: 'F001', caixa: '', lote: '' },
    ];

    const result = deduplicateHospitalRows(distinctRows);
    assert.strictEqual(result.length, 2, 'linhas com registro diferente devem ser preservadas');
  });

});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatMoney,
  normalizePaymentMethod,
  normalizeCardType,
  normalizeBrand,
  getValue,
  getValueContains,
  isSummaryRow,
  getString,
  getMoney,
  createId,
  normalizePdfBrand,
  HEADER_ALIASES,
} from '../../src/js/utils/format.js';

describe('formatMoney', () => {

  it('formata 0 como R$ 0,00', () => {
    assert.strictEqual(formatMoney(0), 'R$\u00A00,00');
  });

  it('formata 100 como R$ 100,00', () => {
    assert.strictEqual(formatMoney(100), 'R$\u00A0100,00');
  });

  it('formata 1234.56 como R$ 1.234,56 (separador de milhar pt-BR)', () => {
    assert.strictEqual(formatMoney(1234.56), 'R$\u00A01.234,56');
  });

  it('formata -50 como -R$ 50,00 (sinal antes do símbolo em pt-BR)', () => {
    assert.strictEqual(formatMoney(-50), '-R$\u00A050,00');
  });

  it('formata null como R$ 0,00 (null coerced via || 0)', () => {
    assert.strictEqual(formatMoney(null), 'R$\u00A00,00');
  });

  it('formata undefined como R$ 0,00', () => {
    assert.strictEqual(formatMoney(undefined), 'R$\u00A00,00');
  });

  it('formata 100.5 como R$ 100,50 (completa casas decimais)', () => {
    assert.strictEqual(formatMoney(100.5), 'R$\u00A0100,50');
  });

  it('formata número grande 1234567.89 como R$ 1.234.567,89', () => {
    assert.strictEqual(formatMoney(1234567.89), 'R$\u00A01.234.567,89');
  });

});

describe('normalizePaymentMethod', () => {

  it('ESPÉCIE (com acento) → ESPÉCIE', () => {
    assert.strictEqual(normalizePaymentMethod('ESPÉCIE'), 'ESPÉCIE');
  });

  it('ESPECIE (sem acento) → ESPÉCIE', () => {
    assert.strictEqual(normalizePaymentMethod('ESPECIE'), 'ESPÉCIE');
  });

  it('especie (lowercase) → ESPÉCIE', () => {
    assert.strictEqual(normalizePaymentMethod('especie'), 'ESPÉCIE');
  });

  it('DINHEIRO → ESPÉCIE (alias dinâmico)', () => {
    assert.strictEqual(normalizePaymentMethod('DINHEIRO'), 'ESPÉCIE');
  });

  it('dinheiro (lowercase) → ESPÉCIE', () => {
    assert.strictEqual(normalizePaymentMethod('dinheiro'), 'ESPÉCIE');
  });

  it('CRÉDITO (com acento) → CRÉDITO', () => {
    assert.strictEqual(normalizePaymentMethod('CRÉDITO'), 'CRÉDITO');
  });

  it('CREDITO (sem acento) → CRÉDITO', () => {
    assert.strictEqual(normalizePaymentMethod('CREDITO'), 'CRÉDITO');
  });

  it('credito (lowercase) → CRÉDITO', () => {
    assert.strictEqual(normalizePaymentMethod('credito'), 'CRÉDITO');
  });

  it('DÉBITO (com acento) → DÉBITO', () => {
    assert.strictEqual(normalizePaymentMethod('DÉBITO'), 'DÉBITO');
  });

  it('DEBITO (sem acento) → DÉBITO', () => {
    assert.strictEqual(normalizePaymentMethod('DEBITO'), 'DÉBITO');
  });

  it('string vazia → "" (lixo tratado como vazio)', () => {
    assert.strictEqual(normalizePaymentMethod(''), '');
  });

  it('valor desconhecido "PIX" → ""', () => {
    assert.strictEqual(normalizePaymentMethod('PIX'), '');
  });

  it('null → ""', () => {
    assert.strictEqual(normalizePaymentMethod(null), '');
  });

  it('undefined → ""', () => {
    assert.strictEqual(normalizePaymentMethod(undefined), '');
  });

  it('mixed case "Crédito" → CRÉDITO', () => {
    assert.strictEqual(normalizePaymentMethod('Crédito'), 'CRÉDITO');
  });

  it('"CRÉDITO DÉBITO" → DÉBITO (RE_DEBITO tem precedência sobre RE_CREDITO quando ambos casam)', () => {

    assert.strictEqual(normalizePaymentMethod('CRÉDITO DÉBITO'), 'DÉBITO');
  });

});

describe('normalizeCardType', () => {

  it('Crédito → CRÉDITO', () => {
    assert.strictEqual(normalizeCardType('Crédito'), 'CRÉDITO');
  });

  it('Débito → DÉBITO', () => {
    assert.strictEqual(normalizeCardType('Débito'), 'DÉBITO');
  });

  it('ESPÉCIE → "" (não é tipo de cartão)', () => {
    assert.strictEqual(normalizeCardType('ESPÉCIE'), '');
  });

  it('PIX → "" (forma não-cartão retorna vazio)', () => {
    assert.strictEqual(normalizeCardType('PIX'), '');
  });

  it('"" → ""', () => {
    assert.strictEqual(normalizeCardType(''), '');
  });

  it('null → ""', () => {
    assert.strictEqual(normalizeCardType(null), '');
  });

});

describe('normalizeBrand', () => {

  it('"visa" → "VISA" (uppercase)', () => {
    assert.strictEqual(normalizeBrand('visa'), 'VISA');
  });

  it('"  Mastercard  " → "MASTERCARD" (trim + uppercase)', () => {
    assert.strictEqual(normalizeBrand('  Mastercard  '), 'MASTERCARD');
  });

  it('"" → "" (vazio → vazio)', () => {
    assert.strictEqual(normalizeBrand(''), '');
  });

  it('null → ""', () => {
    assert.strictEqual(normalizeBrand(null), '');
  });

  it('undefined → ""', () => {
    assert.strictEqual(normalizeBrand(undefined), '');
  });

  it('" elo " → "ELO" (trim de bordas + uppercase)', () => {
    assert.strictEqual(normalizeBrand(' elo '), 'ELO');
  });

});

describe('getValue', () => {

  it('match direto por chave do row', () => {
    const row = { 'Código de autorização': 'AUTH123' };
    assert.strictEqual(getValue(row, ['Código de autorização']), 'AUTH123');
  });

  it('match via alias "autorizador" expande para grafias em HEADER_ALIASES', () => {
    const row = { 'Código de autorização': 'AUTH999' };
    assert.strictEqual(getValue(row, ['autorizador']), 'AUTH999');
  });

  it('sem match → "" (não undefined)', () => {
    const row = { foo: 'bar' };
    assert.strictEqual(getValue(row, ['baz']), '');
  });

  it('row sem chaves + candidatos → ""', () => {
    assert.strictEqual(getValue({}, ['autorizador']), '');
  });

  it('com normalizedMap pré-construído: match por alias', () => {

    const row = { 'Código de autorização': 'AUTH-X' };
    const normalizedMap = new Map([['codigo de autorizacao', 'Código de autorização']]);
    assert.strictEqual(getValue(row, ['autorizador'], normalizedMap), 'AUTH-X');
  });

  it('com normalizedMap: sem match → ""', () => {
    const row = { foo: 'bar' };
    const normalizedMap = new Map([['foo', 'foo']]);
    assert.strictEqual(getValue(row, ['autorizador'], normalizedMap), '');
  });

  it('candidates múltiplos: retorna o primeiro que casa em ordem de resolução', () => {

    const row = { 'Valor Cartão': 100 };
    assert.strictEqual(getValue(row, ['autorizador', 'valorCartao']), 100);
  });

  it('valor numérico é retornado como number, não string', () => {
    const row = { 'Valor Cartão': 50.5 };
    assert.strictEqual(getValue(row, ['valorCartao']), 50.5);
  });

});

describe('getValueContains', () => {

  it('match por substring "autorizador" casa em "autorizador_doc"', () => {
    const row = { autorizador_doc: 'AUTH999' };
    assert.strictEqual(getValueContains(row, ['autorizador']), 'AUTH999');
  });

  it('sem match → ""', () => {
    const row = { foo: 'bar' };
    assert.strictEqual(getValueContains(row, ['autorizador']), '');
  });

  it('match em row com chave direta', () => {
    const row = { autorizador: 'AUTH1' };
    assert.strictEqual(getValueContains(row, ['autorizador']), 'AUTH1');
  });

  it('com normalizedMap: match funciona igual', () => {
    const row = { autorizador_doc: 'AUTH2' };
    const normalizedMap = new Map([['autorizador doc', 'autorizador_doc']]);
    assert.strictEqual(getValueContains(row, ['autorizador'], normalizedMap), 'AUTH2');
  });

  it('row vazio → ""', () => {
    assert.strictEqual(getValueContains({}, ['autorizador']), '');
  });

  it('terms múltiplos: itera row keys, primeiro term que casa vence', () => {

    const row = { autorizador_doc: 'DOC-VAL', autorizador: 'AUTH-VAL' };
    const result = getValueContains(row, ['autorizador']);
    assert.ok(result === 'DOC-VAL' || result === 'AUTH-VAL',
      `deve retornar valor de alguma coluna autorizador*: atual=${result}`);
  });

});

describe('isSummaryRow', () => {

  it('detecta linha que começa com "Total"', () => {
    assert.strictEqual(isSummaryRow({ descricao: 'Total de vendas', valor: 1000 }), true);
  });

  it('detecta linha com "Total de documentos"', () => {
    assert.strictEqual(isSummaryRow({ info: 'Total de documentos processados' }), true);
  });

  it('detecta linha com "Saldo Final"', () => {
    assert.strictEqual(isSummaryRow({ info: 'Saldo Final do dia' }), true);
  });

  it('detecta linha com "Saldo Inicial"', () => {
    assert.strictEqual(isSummaryRow({ info: 'Saldo Inicial do caixa' }), true);
  });

  it('linha normal (sem marcadores) → false', () => {
    assert.strictEqual(isSummaryRow({ descricao: 'Venda avulsa', valor: 100 }), false);
  });

  it('linha vazia → false', () => {
    assert.strictEqual(isSummaryRow({}), false);
  });

  it('case-insensitive: "TOTAL" maiúsculo também é detectado', () => {
    assert.strictEqual(isSummaryRow({ descricao: 'TOTAL GERAL' }), true);
  });

  it('detecta "saldo final" como substring no meio do texto', () => {
    assert.strictEqual(isSummaryRow({ linha: 'conforme saldo final acima' }), true);
  });

});

describe('getString', () => {

  it('retorna String trimmed do valor', () => {
    const row = { 'Código de autorização': '  AUTH1  ' };
    assert.strictEqual(getString(row, ['autorizador']), 'AUTH1');
  });

  it('valor numérico vira string', () => {
    const row = { 'Valor Cartão': 100 };
    assert.strictEqual(getString(row, ['valorCartao']), '100');
  });

  it('sem match → "" (não null, não undefined)', () => {
    const row = { foo: 'bar' };
    assert.strictEqual(getString(row, ['autorizador']), '');
  });

  it('null → ""', () => {
    const row = { 'Código de autorização': null };
    assert.strictEqual(getString(row, ['autorizador']), '');
  });

  it('undefined → ""', () => {
    const row = { 'Código de autorização': undefined };
    assert.strictEqual(getString(row, ['autorizador']), '');
  });

});

describe('getMoney', () => {

  it('parseia valor pt-BR com R$ prefix', () => {
    const row = { 'Valor Fatura': 'R$ 100,00' };
    assert.strictEqual(getMoney(row, ['valorFatura']), 100);
  });

  it('parseia valor sem R$ prefix', () => {
    const row = { 'Valor Fatura': '1.234,56' };
    assert.strictEqual(getMoney(row, ['valorFatura']), 1234.56);
  });

  it('valor numérico direto', () => {
    const row = { 'Valor Cartão': 50.5 };
    assert.strictEqual(getMoney(row, ['valorCartao']), 50.5);
  });

  it('sem match → 0', () => {
    const row = { foo: 'bar' };
    assert.strictEqual(getMoney(row, ['valorFatura']), 0);
  });

  it('valor vazio → 0', () => {
    const row = { 'Valor Fatura': '' };
    assert.strictEqual(getMoney(row, ['valorFatura']), 0);
  });

});

describe('createId', () => {

  it('com index → "prefix-index"', () => {
    assert.strictEqual(createId('bi', 5), 'bi-5');
  });

  it('com index 0 → "prefix-0" (não cai no fallback)', () => {
    assert.strictEqual(createId('mv', 0), 'mv-0');
  });

  it('com index string → "prefix-string" (interpolação)', () => {
    assert.strictEqual(createId('cielo', 'A'), 'cielo-A');
  });

  it('sem index e crypto.randomUUID indisponível → "prefix-{timestamp}"', () => {

    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const id = createId('bi');
      assert.match(id, /^bi-\d+$/, `id deve ser "bi-{timestamp}": atual=${id}`);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  it('sem index + crypto.randomUUID disponível → UUID sem prefix', () => {

    const id = createId('cielo');
    assert.ok(typeof id === 'string');
    assert.ok(id.length > 0, `id deve ser não-vazio: ${id}`);

    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      `id deve ser UUID v4: ${id}`);
  });

});

describe('normalizePdfBrand', () => {

  it('American Express → AMERICAN EXPRESS', () => {
    assert.strictEqual(normalizePdfBrand('American Express'), 'AMERICAN EXPRESS');
  });

  it('Mastercard → MASTERCARD', () => {
    assert.strictEqual(normalizePdfBrand('Mastercard'), 'MASTERCARD');
  });

  it('Visa → VISA', () => {
    assert.strictEqual(normalizePdfBrand('Visa'), 'VISA');
  });

  it('Elo → ELO', () => {
    assert.strictEqual(normalizePdfBrand('Elo'), 'ELO');
  });

  it('Hipercard → HIPERCARD', () => {
    assert.strictEqual(normalizePdfBrand('Hipercard'), 'HIPERCARD');
  });

  it('Master - Gold → MASTERCARD (substring "master" vence)', () => {
    assert.strictEqual(normalizePdfBrand('Master - Gold'), 'MASTERCARD');
  });

  it('Visa - Platinum → VISA (substring "visa" vence)', () => {
    assert.strictEqual(normalizePdfBrand('Visa - Platinum'), 'VISA');
  });

  it('bandeira desconhecida "Diners" → DINERS (fallback uppercase antes de " - ")', () => {

    assert.strictEqual(normalizePdfBrand('Diners'), 'DINERS');
  });

  it('bandeira desconhecida "Diners - Black" → DINERS (split antes de " - ")', () => {
    assert.strictEqual(normalizePdfBrand('Diners - Black'), 'DINERS');
  });

  it('string vazia → ""', () => {
    assert.strictEqual(normalizePdfBrand(''), '');
  });

  it('null → ""', () => {
    assert.strictEqual(normalizePdfBrand(null), '');
  });

  it('undefined → ""', () => {
    assert.strictEqual(normalizePdfBrand(undefined), '');
  });

  it('remove trailing hyphens antes do trim', () => {

    assert.strictEqual(normalizePdfBrand('American Express---'), 'AMERICAN EXPRESS');
  });

});

describe('HEADER_ALIASES', () => {

  it('expos os aliases principais do sistema', () => {

    assert.ok('autorizador' in HEADER_ALIASES, 'autorizador deve existir');
    assert.ok('valorCartao' in HEADER_ALIASES, 'valorCartao deve existir');
    assert.ok('valorDinheiro' in HEADER_ALIASES, 'valorDinheiro deve existir');
    assert.ok('valorFatura' in HEADER_ALIASES, 'valorFatura deve existir');
    assert.ok('contaFatura' in HEADER_ALIASES, 'contaFatura deve existir');
    assert.ok('parcelas' in HEADER_ALIASES, 'parcelas deve existir');
    assert.ok('dataVenda' in HEADER_ALIASES, 'dataVenda deve existir');
  });

  it('parcelas tem 7 grafias suportadas', () => {

    assert.strictEqual(HEADER_ALIASES.parcelas.length, 7,
      `parcelas deve ter exatamente 7 grafias: atual=${HEADER_ALIASES.parcelas.join(' | ')}`);
    assert.ok(HEADER_ALIASES.parcelas.includes('Parcelas'));
    assert.ok(HEADER_ALIASES.parcelas.includes('Quantidade de parcelas'));
    assert.ok(HEADER_ALIASES.parcelas.includes('Qtd parcelas'));
    assert.ok(HEADER_ALIASES.parcelas.includes('Plano'));
  });

  it('valorCartao é alias para grafias com/sem acento', () => {
    assert.deepStrictEqual(HEADER_ALIASES.valorCartao, ['Valor Cartão', 'Valor Cartao']);
  });

  it('debitoCredito cobre grafias com/sem acento + espaço', () => {
    assert.ok(HEADER_ALIASES.debitoCredito.includes('Débito/ Crédito'));
    assert.ok(HEADER_ALIASES.debitoCredito.includes('Débito/Crédito'));
    assert.ok(HEADER_ALIASES.debitoCredito.includes('Debito/ Credito'));
  });

  it('objeto é frozen (imutável)', () => {
    assert.ok(Object.isFrozen(HEADER_ALIASES),
      'HEADER_ALIASES deve ser Object.freeze para evitar mutação acidental');
  });

});
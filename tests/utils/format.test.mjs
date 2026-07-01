import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseMoneyBR,
  parseMoneyBRStrict,
  normalizeAuth,
} from '../../src/js/utils/format.js';

describe('parseMoneyBR', () => {

  it('parseMoneyBR("R$ 1.234,56") → 1234.56', () => {
    assert.strictEqual(parseMoneyBR('R$ 1.234,56'), 1234.56);
  });

  it('parseMoneyBR("R$ 100,00") → 100', () => {
    assert.strictEqual(parseMoneyBR('R$ 100,00'), 100);
  });

  it('parseMoneyBR("1.234,56") → 1234.56 (sem R$)', () => {
    assert.strictEqual(parseMoneyBR('1.234,56'), 1234.56);
  });

  it('parseMoneyBR("1234.56") → 1234.56 (US format)', () => {
    assert.strictEqual(parseMoneyBR('1234.56'), 1234.56);
  });

  it('parseMoneyBR(1234.56) → 1234.56 (number passthrough)', () => {
    assert.strictEqual(parseMoneyBR(1234.56), 1234.56);
  });

  it('parseMoneyBR(null) → 0', () => {
    assert.strictEqual(parseMoneyBR(null), 0);
  });

  it('parseMoneyBR("") → 0 (empty string)', () => {
    assert.strictEqual(parseMoneyBR(''), 0);
  });

  it('parseMoneyBR("abc") → 0 (invalid)', () => {
    assert.strictEqual(parseMoneyBR('abc'), 0);
  });

  it('parseMoneyBR("R$ 0,00") → 0', () => {
    assert.strictEqual(parseMoneyBR('R$ 0,00'), 0);
  });

  it('parseMoneyBR("R$ 50.000,00") → 50000', () => {
    assert.strictEqual(parseMoneyBR('R$ 50.000,00'), 50000);
  });

  it('A1: parseMoneyBR("12 34 56") → 123456 (com warning de whitespace)', () => {

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      assert.strictEqual(parseMoneyBR('12 34 56'), 123456);
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warned, 'whitespace deve gerar warning');
  });

  it('A1: parseMoneyBR("1.000 50") → 1.0005 (também warning)', () => {

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      assert.strictEqual(parseMoneyBR('1.000 50'), 1.0005);
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warned, 'whitespace em valor com ponto deve gerar warning');
  });

});

describe('parseMoneyBRStrict', () => {

  it('parseMoneyBRStrict("R$ 100,00") → { value: 100, valid: true }', () => {
    const result = parseMoneyBRStrict('R$ 100,00');
    assert.strictEqual(result.value, 100);
    assert.strictEqual(result.valid, true);
  });

  it('parseMoneyBRStrict("abc") → { value: 0, valid: false }', () => {
    const result = parseMoneyBRStrict('abc');
    assert.strictEqual(result.value, 0);
    assert.strictEqual(result.valid, false);
  });

  it('parseMoneyBRStrict("") → { value: 0, valid: false }', () => {
    const result = parseMoneyBRStrict('');
    assert.strictEqual(result.value, 0);
    assert.strictEqual(result.valid, false);
  });

  it('parseMoneyBRStrict(null) → { value: 0, valid: false }', () => {
    const result = parseMoneyBRStrict(null);
    assert.strictEqual(result.value, 0);
    assert.strictEqual(result.valid, false);
  });

  it('parseMoneyBRStrict(100) → { value: 100, valid: true } (number)', () => {
    const result = parseMoneyBRStrict(100);
    assert.strictEqual(result.value, 100);
    assert.strictEqual(result.valid, true);
  });

  it('parseMoneyBRStrict(NaN) → { value: 0, valid: false }', () => {
    const result = parseMoneyBRStrict(NaN);
    assert.strictEqual(result.value, 0);
    assert.strictEqual(result.valid, false);
  });

  it('parseMoneyBRStrict("1,234") → { value: 1234, valid: true } (US thousand)', () => {
    const result = parseMoneyBRStrict('1,234');
    assert.strictEqual(result.value, 1234);
    assert.strictEqual(result.valid, true);
  });

  it('parseMoneyBRStrict("1,234.56") → { value: 1234.56, valid: true } (US format)', () => {
    const result = parseMoneyBRStrict('1,234.56');
    assert.strictEqual(result.value, 1234.56);
    assert.strictEqual(result.valid, true);
  });

});

describe('normalizeAuth', () => {

  it('normalizeAuth("123456") → "123456" (already 6 digits)', () => {
    assert.strictEqual(normalizeAuth('123456'), '123456');
  });

  it('normalizeAuth("  123456  ") → "123456" (trim)', () => {
    assert.strictEqual(normalizeAuth('  123456  '), '123456');
  });

  it('normalizeAuth("12345") → "12345" (no padding — plain numeric kept as-is)', () => {
    assert.strictEqual(normalizeAuth('12345'), '12345');
  });

  it('normalizeAuth("1234") → "1234" (no padding — plain numeric kept as-is)', () => {
    assert.strictEqual(normalizeAuth('1234'), '1234');
  });

  it('normalizeAuth("123") → "123" (no padding — plain numeric kept as-is)', () => {
    assert.strictEqual(normalizeAuth('123'), '123');
  });

  it('normalizeAuth("AUTH123") → "AUTH123" (uppercase non-numeric)', () => {
    assert.strictEqual(normalizeAuth('AUTH123'), 'AUTH123');
  });

  it('normalizeAuth("auth-456") → "AUTH-456" (uppercase mixed)', () => {
    assert.strictEqual(normalizeAuth('auth-456'), 'AUTH-456');
  });

  it('normalizeAuth("") → "" (empty)', () => {
    assert.strictEqual(normalizeAuth(''), '');
  });

  it('normalizeAuth(null) → "" (null)', () => {
    assert.strictEqual(normalizeAuth(null), '');
  });

  it('normalizeAuth("  ") → "" (whitespace only)', () => {
    assert.strictEqual(normalizeAuth('  '), '');
  });

  it('normalizeAuth("123.0") → "123" (trailing .0 removed, no padding)', () => {
    assert.strictEqual(normalizeAuth('123.0'), '123');
  });

  it('normalizeAuth("22-360-085917") → "085917" (compound format: extracts last 6 digits)', () => {
    assert.strictEqual(normalizeAuth('22-360-085917'), '085917');
  });

  it('normalizeAuth("17-360-606276") → "606276" (compound format: last 6 digits)', () => {
    assert.strictEqual(normalizeAuth('17-360-606276'), '606276');
  });

  it('normalizeAuth("123456789") → "123456789" (numeric > 6, no pad)', () => {
    assert.strictEqual(normalizeAuth('123456789'), '123456789');
  });

  it('normalizeAuth("<script>") → "" (rejeitado, não stripping)', () => {
    assert.strictEqual(normalizeAuth('<script>'), '');
  });

  it('normalizeAuth("AUTH<>") → "" (rejeitado)', () => {
    assert.strictEqual(normalizeAuth('AUTH<>'), '');
  });

  it('normalizeAuth("123"456") → "" (rejeitado)', () => {
    assert.strictEqual(normalizeAuth('123"456'), '');
  });

  it('normalizeAuth("AUTH`B") → "" (rejeitado, backtick)', () => {
    assert.strictEqual(normalizeAuth('AUTH`B'), '');
  });

  it('normalizeAuth("<script>alert(1)</script>") → "" (rejeitado)', () => {
    assert.strictEqual(normalizeAuth('<script>alert(1)</script>'), '');
  });

  it('normalizeAuth("AUTH\\" onload=alert(1)") → "" (rejeitado)', () => {
    assert.strictEqual(normalizeAuth('AUTH" onload=alert(1)'), '');
  });

  it('normalizeAuth("") → "" (empty string)', () => {
    assert.strictEqual(normalizeAuth(''), '');
  });

  it('normalizeAuth("=SUM(A1)") → "" (formula injection rejeitada)', () => {
    assert.strictEqual(normalizeAuth('=SUM(A1)'), '');
  });

  it('normalizeAuth("123;DROP TABLE users") → "" (SQL-like syntax)', () => {
    assert.strictEqual(normalizeAuth('123;DROP TABLE users'), '');
  });

  it('normalizeAuth("AUTH(ALERT)") → "" (parens de função JS)', () => {
    assert.strictEqual(normalizeAuth('AUTH(ALERT)'), '');
  });

  it('normalizeAuth("{cmd}") → "" (braces de object)', () => {
    assert.strictEqual(normalizeAuth('{cmd}'), '');
  });

  it('normalizeAuth("[1]") → "" (brackets)', () => {
    assert.strictEqual(normalizeAuth('[1]'), '');
  });

});
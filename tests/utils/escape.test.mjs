import { describe, it } from 'node:test';
import assert from 'node:assert';
import { escapeHtml, escapeAttr } from '../../src/js/utils/sanitize.js';

describe('escapeHtml', () => {

  it('deve escapar < e >', () => {
    assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('deve escapar &', () => {
    assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
  });

  it('deve escapar " (aspas duplas)', () => {
    assert.strictEqual(escapeHtml('"teste"'), '&quot;teste&quot;');
  });

  it('deve escapar \' (aspas simples)', () => {
    assert.strictEqual(escapeHtml("'teste'"), '&#39;teste&#39;');
  });

  it('deve escapar múltiplos caracteres perigosos', () => {
    assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('deve retornar string vazia para string vazia', () => {
    assert.strictEqual(escapeHtml(''), '');
  });

  it('deve retornar string vazia para null', () => {
    assert.strictEqual(escapeHtml(null), '');
  });

  it('deve retornar string vazia para undefined', () => {
    assert.strictEqual(escapeHtml(undefined), '');
  });

  it('deve lidar com números convertendo para string', () => {
    assert.strictEqual(escapeHtml(123), '123');
  });

  it('deve preservar texto sem caracteres perigosos', () => {
    assert.strictEqual(escapeHtml('texto normal sem perigo'), 'texto normal sem perigo');
  });

  it('deve escapar texto com espaços e quebras de linha', () => {
    assert.strictEqual(escapeHtml('<b>negrito</b>\n\t'), '&lt;b&gt;negrito&lt;/b&gt;\n\t');
  });

});

describe('escapeAttr', () => {

  it('deve escapar < e >', () => {
    assert.strictEqual(escapeAttr('<b>'), '&lt;b&gt;');
  });

  it('deve escapar &', () => {
    assert.strictEqual(escapeAttr('a & b'), 'a &amp; b');
  });

  it('deve escapar " (aspas duplas)', () => {
    assert.strictEqual(escapeAttr('"valor"'), '&quot;valor&quot;');
  });

  it('deve escapar \' (aspas simples)', () => {
    assert.strictEqual(escapeAttr("'valor'"), '&#39;valor&#39;');
  });

  it('deve escapar ` (backtick) - atributo data-*', () => {
    assert.strictEqual(escapeAttr('`test`'), '&#96;test&#96;');
  });

  it('deve escapar todos os caracteres perigosos para atributos', () => {
    assert.strictEqual(escapeAttr('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('deve escapar payload XSS com backtick', () => {
    assert.strictEqual(escapeAttr('<img src=x onerror=`alert(1)`>'), '&lt;img src=x onerror=&#96;alert(1)&#96;&gt;');
  });

  it('deve retornar string vazia para string vazia', () => {
    assert.strictEqual(escapeAttr(''), '');
  });

  it('deve retornar string vazia para null', () => {
    assert.strictEqual(escapeAttr(null), '');
  });

  it('deve retornar string vazia para undefined', () => {
    assert.strictEqual(escapeAttr(undefined), '');
  });

  it('deve lidar com números convertendo para string', () => {
    assert.strictEqual(escapeAttr(42), '42');
  });

  it('deve preservar texto sem caracteres perigosos', () => {
    assert.strictEqual(escapeAttr('valor normal'), 'valor normal');
  });

  it('deve preservar caracteres alfanuméricos e espaços', () => {
    assert.strictEqual(escapeAttr('João Silva 123'), 'João Silva 123');
  });

});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeText } from '../../src/js/utils/string.js';

describe('normalizeText', () => {

  it('deve converter para minúsculas', () => {
    assert.strictEqual(normalizeText('João'), 'joao');
  });

  it('deve remover acentos (NFD normalization)', () => {
    assert.strictEqual(normalizeText('João'), 'joao');
  });

  it('deve remover múltiplos acentos', () => {
    assert.strictEqual(normalizeText('ÇáÉÍÓÚ'), 'caeiou');
  });

  it('deve fazer trim (remover espaços no início e fim)', () => {
    assert.strictEqual(normalizeText('  João  '), 'joao');
  });

  it('deve colapsar espaços múltiplos em um único espaço', () => {
    assert.strictEqual(normalizeText('João    Silva'), 'joao silva');
  });

  it('deve colapsar tabs e newlines', () => {
    assert.strictEqual(normalizeText('João\n\tSilva'), 'joao silva');
  });

  it('deve processar texto normal sem modificações significativas', () => {
    assert.strictEqual(normalizeText('joao silva'), 'joao silva');
  });

  it('deve retornar string vazia para string vazia', () => {
    assert.strictEqual(normalizeText(''), '');
  });

  it('deve retornar string vazia para null', () => {
    assert.strictEqual(normalizeText(null), '');
  });

  it('deve retornar string vazia para undefined', () => {
    assert.strictEqual(normalizeText(undefined), '');
  });

  it('deve lidar com números convertendo para string', () => {
    assert.strictEqual(normalizeText(12345), '12345');
  });

  it('deve normalizar texto misto com acentos e espaços', () => {
    assert.strictEqual(normalizeText('  José    da    Silva  '), 'jose da silva');
  });

  it('deve remover diacríticos variados', () => {
    assert.strictEqual(normalizeText('ãéìõû'), 'aeiou');
  });

});

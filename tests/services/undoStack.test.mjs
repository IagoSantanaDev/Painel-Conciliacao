import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createUndoStack } from '../../src/js/services/undoStack.js';

describe('createUndoStack', () => {

  it('push adiciona operacao ao undoStack e limpa redoStack', () => {
    const h = createUndoStack();
    h.push({ id: 1 }, { id: 2 }, 0);
    assert.strictEqual(h.size(), 1);
    assert.ok(h.canUndo());
    assert.ok(!h.canRedo());
  });

  it('nova edição após undo limpa redoStack', () => {
    const h = createUndoStack();
    h.push({ v: 1 }, { v: 2 }, 0);
    h.undo();
    assert.ok(h.canRedo());
    h.push({ v: 3 }, { v: 4 }, 0);
    assert.ok(!h.canRedo(), 'nova edição deve limpar redoStack');
  });

  it('undo retorna op e move para redoStack', () => {
    const h = createUndoStack();
    h.push({ v: 1 }, { v: 2 }, 0);
    const op = h.undo();
    assert.deepStrictEqual(op, { index: 0, before: { v: 1 }, after: { v: 2 } });
    assert.ok(!h.canUndo());
    assert.ok(h.canRedo());
  });

  it('undo sem operações retorna null', () => {
    const h = createUndoStack();
    assert.strictEqual(h.undo(), null);
  });

  it('redo retorna op e move de volta para undoStack', () => {
    const h = createUndoStack();
    h.push({ v: 1 }, { v: 2 }, 0);
    h.undo();
    const op = h.redo();
    assert.deepStrictEqual(op, { index: 0, before: { v: 1 }, after: { v: 2 } });
    assert.ok(h.canUndo());
    assert.ok(!h.canRedo());
  });

  it('redo sem operações no redoStack retorna null', () => {
    const h = createUndoStack();
    h.push({ v: 1 }, { v: 2 }, 0);
    assert.strictEqual(h.redo(), null);
  });

  it('limite: descarta operações antigas quando excede', () => {
    const h = createUndoStack(3);
    h.push({ v: 1 }, { v: 2 }, 0);
    h.push({ v: 2 }, { v: 3 }, 0);
    h.push({ v: 3 }, { v: 4 }, 0);
    h.push({ v: 4 }, { v: 5 }, 0);
    assert.strictEqual(h.size(), 3, 'mantem apenas 3 operações');

    const op = h.undo();
    assert.deepStrictEqual(op.after, { v: 5 }, 'operação mais recente');
    const op2 = h.undo();
    assert.deepStrictEqual(op2.after, { v: 4 });
    const op3 = h.undo();
    assert.deepStrictEqual(op3.after, { v: 3 });
    assert.strictEqual(h.undo(), null, 'operação {v:2} foi descartada');
  });

  it('clear limpa ambos os stacks', () => {
    const h = createUndoStack();
    h.push({ v: 1 }, { v: 2 }, 0);
    h.undo();
    h.clear();
    assert.ok(!h.canUndo());
    assert.ok(!h.canRedo());
    assert.strictEqual(h.size(), 0);
  });

  it('push com before ou after null/undefined é noop (defesa)', () => {
    const h = createUndoStack();
    h.push(null, { v: 2 }, 0);
    h.push({ v: 1 }, undefined, 0);
    assert.strictEqual(h.size(), 0);
  });

  it('sequência undo/redo preserva estado exato', () => {
    const h = createUndoStack();
    h.push({ id: 1, auth: 'A' }, { id: 1, auth: 'B' }, 0);
    h.push({ id: 1, auth: 'B' }, { id: 1, auth: 'C' }, 0);

    assert.deepStrictEqual(h.undo().after, { id: 1, auth: 'C' });
    assert.deepStrictEqual(h.undo().after, { id: 1, auth: 'B' });
    assert.strictEqual(h.undo(), null);

    assert.deepStrictEqual(h.redo().after, { id: 1, auth: 'B' });
    assert.deepStrictEqual(h.redo().after, { id: 1, auth: 'C' });
    assert.strictEqual(h.redo(), null);
  });

  it('integra com reconciliation: edit auth → undo → row volta', () => {
    const h = createUndoStack();

    const rowOriginal = { id: 1, statusLabel: 'Conciliado', autorizador: 'A', status: ['Conciliado'] };
    const rowEditado = { id: 1, statusLabel: 'Divergente', autorizador: 'B', status: ['Não encontrado na Cielo'] };

    h.push(rowOriginal, rowEditado, 0);

    let current = rowEditado;
    const op = h.undo();
    current = op.before;
    assert.strictEqual(current.autorizador, 'A');
    assert.strictEqual(current.statusLabel, 'Conciliado');

    const opRedo = h.redo();
    current = opRedo.after;
    assert.strictEqual(current.autorizador, 'B');
    assert.strictEqual(current.statusLabel, 'Divergente');
  });
});

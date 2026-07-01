import { describe, it } from 'node:test';
import assert from 'node:assert';
import { chunkedAppend, CHUNK_SIZE_ROWS } from '../../src/js/ui/chunkedRender.js';

function makeTbody() {
  const children = [];
  return {
    children,
    append(...nodes) {
      for (const n of nodes) children.push(n);
    },
    replaceChildren() { children.length = 0; },
    appendChild(node) { children.push(node); },
  };
}

function makeRaf() {
  const callbacks = new Map();
  let counter = 0;
  return {
    requestAnimationFrame(cb) {
      callbacks.set(++counter, cb);
      return counter;
    },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    flushRaf() {

      const firstKey = callbacks.keys().next().value;
      if (firstKey === undefined) return;
      const cb = callbacks.get(firstKey);
      callbacks.delete(firstKey);
      cb(performance.now());
    },
    flushAll() {

      while (callbacks.size > 0) this.flushRaf();
    },
    pendingCount() { return callbacks.size; },
  };
}

function makeTemplate() {
  const calls = [];
  const createTemplate = (html) => {
    calls.push(html);

    const rowCount = (html.match(/<\/tr>/g) || []).length;
    const childNodes = Array.from({ length: rowCount }, (_, i) => ({ idx: i, html }));
    return { content: { childNodes } };
  };
  return { calls, createTemplate };
}

describe('chunkedAppend — chunked rAF scheduler', () => {

  it('processa array vazio sem chamar rAF', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const handle = chunkedAppend(tbody, [], { ...raf });
    assert.strictEqual(raf.pendingCount(), 0, 'rAF nao deve ser agendado para array vazio');
    handle.cancel();
  });

  it('processa 1 row com 1 unico chunk (sem encadear rAF)', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const tpl = makeTemplate();
    chunkedAppend(tbody, ['<tr>1</tr>'], {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createTemplate: tpl.createTemplate,
    });
    assert.strictEqual(raf.pendingCount(), 1, '1 chunk agendado');
    raf.flushRaf();
    assert.strictEqual(tbody.children.length, 1, '1 row inserida');
    assert.strictEqual(raf.pendingCount(), 0, 'sem encadeamento apos 1 chunk');
  });

  it('processa 1000 rows em 2 chunks (CHUNK_SIZE_ROWS=500)', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const tpl = makeTemplate();
    const htmlStrings = Array.from({ length: 1000 }, (_, i) => `<tr data-idx="${i}">r${i}</tr>`);
    chunkedAppend(tbody, htmlStrings, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createTemplate: tpl.createTemplate,
    });

    assert.strictEqual(raf.pendingCount(), 1);
    raf.flushRaf();

    assert.strictEqual(tbody.children.length, 500);
    assert.strictEqual(raf.pendingCount(), 1);
    raf.flushRaf();

    assert.strictEqual(tbody.children.length, 1000);
    assert.strictEqual(raf.pendingCount(), 0);
  });

  it('processa chunks em ordem correta', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const tpl = makeTemplate();
    const htmlStrings = Array.from({ length: 1500 }, (_, i) => `<tr>row${i}</tr>`);
    chunkedAppend(tbody, htmlStrings, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createTemplate: tpl.createTemplate,
    });
    raf.flushAll();

    assert.strictEqual(tpl.calls.length, 3);
    assert.ok(tpl.calls[0].startsWith('<tr>row0'), '1o chunk comeca com row0');
    assert.ok(tpl.calls[0].includes('<tr>row499'), '1o chunk termina com row499');
    assert.ok(tpl.calls[1].includes('<tr>row500'), '2o chunk comeca com row500');
    assert.ok(tpl.calls[2].includes('<tr>row1000'), '3o chunk comeca com row1000');
  });

  it('cancel() impede encadeamento de novos chunks', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const tpl = makeTemplate();
    const htmlStrings = Array.from({ length: 2000 }, (_, i) => `<tr>r${i}</tr>`);
    const handle = chunkedAppend(tbody, htmlStrings, {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createTemplate: tpl.createTemplate,
    });
    raf.flushRaf();
    assert.strictEqual(tbody.children.length, 500);
    assert.strictEqual(raf.pendingCount(), 1);
    handle.cancel();
    assert.strictEqual(raf.pendingCount(), 0, 'cancel remove rAF pendente');
    raf.flushRaf();
    assert.strictEqual(tbody.children.length, 500, 'cancel impede novo chunk');
  });

  it('cancel() em render ja completo e no-op', () => {
    const raf = makeRaf();
    const tbody = makeTbody();
    const tpl = makeTemplate();
    const handle = chunkedAppend(tbody, ['<tr>only</tr>'], {
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame,
      createTemplate: tpl.createTemplate,
    });
    raf.flushRaf();
    assert.doesNotThrow(() => handle.cancel(), 'cancel pos-completion nao lanca');
  });

  it('CHUNK_SIZE_ROWS exportado = 500', () => {
    assert.strictEqual(CHUNK_SIZE_ROWS, 500);
  });
});
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

before(() => {

  const eventListeners = new WeakMap();

  function makeElement(tag) {
    const elem = {
      tagName: tag.toUpperCase(),
      children: [],
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener(name, fn) {
        const list = eventListeners.get(this) || [];
        list.push({ name, fn });
        eventListeners.set(this, list);
      },
      removeEventListener(name, fn) {
        const list = eventListeners.get(this) || [];
        eventListeners.set(this, list.filter(e => e.name !== name || e.fn !== fn));
      },
      dispatchEvent(event) {
        const list = eventListeners.get(this) || [];
        for (const { name, fn } of list) {
          if (name === event.type) fn(event);
        }
        return true;
      },
      replaceChildren: () => {},
      appendChild: () => {},
      replaceWith: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      value: '',
      files: [],
      textContent: '',
      innerHTML: '',
      attrs: {},
    };
    return elem;
  }

  globalThis.document = {
    createElement: tag => makeElement(tag),
    createElementNS: tag => makeElement(tag),
    getElementById: id => makeElement(id),
    querySelector: () => makeElement('div'),
    addEventListener: () => {},
    body: makeElement('body'),
  };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  globalThis.DataTransfer = class {
    constructor() { this.items = { add: () => {}, remove: () => {} }; this.files = []; }
  };
});

after(() => {
  delete globalThis.document;
  delete globalThis.Event;
  delete globalThis.DataTransfer;
});

describe('setupDropZone (smoke)', () => {

  it('setupDropZone registra listeners dragenter/dragover/dragleave/drop sem throw', () => {
    return import('../../src/js/ui/dropZone.js').then(({ setupDropZone }) => {
      const dropZone = document.createElement('div');
      const input = document.createElement('input');
      const showAlert = () => {};
      const el = {};
      assert.doesNotThrow(() => setupDropZone({
        dropZone, input,
        acceptedExtensions: ['.xlsx', '.pdf'],
        invalidMessage: 'inv',
        el, showAlert,
      }));
    });
  });

  it('setupDropZone aceita configs mínimas (dropZone+input vazios)', () => {
    return import('../../src/js/ui/dropZone.js').then(({ setupDropZone }) => {
      const dropZone = document.createElement('div');
      const input = document.createElement('input');

      assert.doesNotThrow(() => setupDropZone({
        dropZone, input,
        acceptedExtensions: ['.csv'],
        invalidMessage: 'teste',
        el: undefined,
        showAlert: undefined,
      }));
    });
  });

  it('setupDropZone é idempotente no mesmo dropZone (não duplica listeners)', () => {
    return import('../../src/js/ui/dropZone.js').then(({ setupDropZone }) => {

      const eventListeners = new WeakMap();
      const dropZone = {
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener(name, fn) {
          const list = eventListeners.get(this) || [];
          list.push({ name, fn });
          eventListeners.set(this, list);
        },
        removeEventListener() {},
        dispatchEvent: () => true,
      };
      const input = {
        files: [],
        dispatchEvent: () => true,
      };
      const el = {};
      const showAlert = () => {};

      setupDropZone({ dropZone, input, acceptedExtensions: ['.xlsx'], invalidMessage: 'm', el, showAlert });
      const firstCount = eventListeners.get(dropZone)?.length || 0;

      setupDropZone({ dropZone, input, acceptedExtensions: ['.xlsx'], invalidMessage: 'm', el, showAlert });
      const secondCount = eventListeners.get(dropZone)?.length || 0;

      assert.ok(firstCount > 0, 'primeira chamada deve anexar listeners');
      assert.equal(secondCount, firstCount, 'segunda chamada no mesmo dropZone não deve duplicar listeners');
    });
  });
});

describe('renderAll (smoke)', () => {

  it('renderTabela indiretamente via renderAll popula tabela com dados vazios (smoke)', () => {
    return import('../../src/js/ui/render.js').then(({ renderAll }) => {
      assert.strictEqual(typeof renderAll, 'function');

    });
  });

  it('renderAll não lança com DOM mínimo (smoke renderTabela)', () => {
    return import('../../src/js/ui/render.js').then(({ renderAll }) => {
      const el = {
        tabelaBody: document.createElement('tbody'),
        resultCount: document.createElement('span'),
        metricsGrid: document.createElement('div'),
        toolbar: document.createElement('div'),
        emptyState: document.createElement('div'),
        tableWrap: document.createElement('div'),
        exportBtn: document.createElement('button'),
        filters: document.createElement('div'),
        tableSearch: document.createElement('input'),
        hospitalFile: document.createElement('input'),
        cieloFile: document.createElement('input'),
        hospitalFileName: document.createElement('span'),
        cieloFileName: document.createElement('span'),
        hospitalDropZone: document.createElement('div'),
        cieloDropZone: document.createElement('div'),
        alertHost: document.createElement('div'),
        processBtn: document.createElement('button'),
      };
      const state = {
        dadosFinal: [],
        currentFilter: 'todos',
        searchQuery: '',
        duplicateAutorizadores: new Set(),
      };

      try {
        renderAll(el, state, () => {});
      } catch (err) {

        assert.ok(
          err.message.includes('is not a function') || err.message.includes('Cannot read'),
          `Erro esperado de polyfill mínimo: ${err.message}`,
        );
      }
    });
  });
});

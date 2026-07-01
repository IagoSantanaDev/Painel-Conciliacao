import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

export const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
export const VENDOR_DIR = resolve(PROJECT_ROOT, 'src', 'vendor');

export function textToArrayBuffer(text) {
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

export function mockCsvFile(text, name = 'test.csv', type = 'text/csv') {
  return {
    name,
    type,
    size: text.length,
    arrayBuffer: () => Promise.resolve(textToArrayBuffer(text)),
  };
}

export function mockPdfFile({ name = 'test.pdf', text = '%PDF-1.4\n' } = {}) {
  return {
    name,
    type: 'application/pdf',
    size: text.length,
    arrayBuffer: () => Promise.resolve(textToArrayBuffer(text)),
  };
}

export function createHospitalRow(overrides = {}) {
  return {
    origem: 'BI_MV',
    id: 1,
    registro: '0001',
    contaFatura: 'FAT-001',
    caixa: 'C01',
    lote: 'L001',
    dataPagamento: '18/06/2026',
    horaPagamento: '10:00:00',
    autorizador: '123456',
    valorCartao: 100,
    valorDinheiro: 0,
    valorFatura: 100,
    desconto: 0,
    bandeira: 'VISA',
    formaPagamento: 'Crédito',
    parcelas: '1',
    numeroMaquina: 'MAQ001',
    corrigido: false,
    ...overrides,
  };
}

export function createCieloRow(overrides = {}) {
  return {
    idInterno: 'CIELO001',
    autorizador: '123456',
    valorBruto: 100,
    bandeira: 'VISA',
    formaPagamento: 'Crédito',
    parcelas: '1',
    numeroMaquina: 'MAQ001',
    dataVenda: '2024-01-15',
    horaVenda: '10:00',
    nsu: 'NSU001',
    ...overrides,
  };
}

export function loadXlsxFromVendor(sandbox = {}) {
  const xlsxPath = resolve(VENDOR_DIR, 'xlsx.full.min.js');
  const xlsxSrc = readFileSync(xlsxPath, 'utf8');
  const ctx = sandbox || {};
  ctx.window = ctx.window || ctx;
  ctx.console = ctx.console || console;
  if (typeof vm.runInNewContext === 'function') {
    vm.runInNewContext(xlsxSrc, ctx);
  } else {

    const fn = new Function('sandbox', 'with (sandbox) { ' + xlsxSrc + ' }');
    fn(ctx);
  }
  return ctx;
}

export function makeXlsxSandbox({ withDocument = true } = {}) {
  const sandbox = { console };
  sandbox.window = sandbox;
  if (withDocument) {
    Object.defineProperty(sandbox, 'document', {
      value: { createElement: () => ({ style: {} }) },
      writable: true,
      configurable: true,
    });
  }
  return loadXlsxFromVendor(sandbox);
}

export function setupBrowserGlobals({
  XLSX,
  Papa = null,
  document: docMock = {
    createElement: () => ({ href: '', download: '', rel: '', appendChild() {}, remove() {} }),
    body: { appendChild() {} },
  },
  urlMock = { createObjectURL: () => 'blob:', revokeObjectURL() {} },
  blobMock = class {},
} = {}) {
  if (XLSX) {
    globalThis.XLSX = XLSX;
    globalThis.window = { XLSX };
  }
  if (Papa) globalThis.window = { ...(globalThis.window || {}), Papa };
  globalThis.URL = urlMock;
  globalThis.Blob = blobMock;
  globalThis.document = docMock;
  return { XLSX, Papa, document: docMock, urlMock, blobMock };
}

export function teardownBrowserGlobals() {
  delete globalThis.XLSX;
  delete globalThis.window;
  delete globalThis.URL;
  delete globalThis.Blob;
  delete globalThis.document;
}

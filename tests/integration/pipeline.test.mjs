import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(__dirname, '../../src/vendor');
const APP_JS = path.resolve(__dirname, '../../src/js/app.js');
const INDEX_HTML = path.resolve(__dirname, '../../index.html');

const { validateFiles } = await import('../../src/js/utils/validateFiles.js');

describe('S03: validateFiles — validação de upload', () => {
  it('rejeita extensão inválida para arquivo Cielo (.txt)', () => {
    const fakeFile = { name: 'vendas.txt', size: 1024 };
    assert.throws(
      () => validateFiles([fakeFile], ['csv', 'xlsx', 'xls', 'xlsm', 'xlsb', 'ods'], 'Arquivo Cielo'),
      /não permitida/
    );
  });

  it('rejeita arquivo maior que 20 MB', () => {
    const bigFile = { name: 'vendas.csv', size: 21 * 1024 * 1024 };
    assert.throws(
      () => validateFiles([bigFile], ['csv', 'xlsx'], 'Arquivo Cielo'),
      /excede o limite/
    );
  });

  it('passa com extensão e tamanho válidos', () => {
    const goodFile = { name: 'vendas.csv', size: 1024 };
    assert.doesNotThrow(() =>
      validateFiles([goodFile], ['csv', 'xlsx'], 'Arquivo Cielo')
    );
  });
});

describe('S01: pdf.js ESM — versão >= 4.2.67 e isEvalSupported:false', () => {
  it('pdf.min.mjs existe no vendor dir', () => {
    const pdfMjs = path.join(VENDOR_DIR, 'pdf.min.mjs');
    assert.ok(fs.existsSync(pdfMjs), 'pdf.min.mjs deveria existir');
  });

  it('não existe pdf.min.js UMD (pdf.js é distribuído apenas como ESM)', () => {
    const pdfUmd = path.join(VENDOR_DIR, 'pdf.min.js');
    assert.ok(!fs.existsSync(pdfUmd), 'pdf.min.js UMD não deve existir no vendor');
  });

  it('pdf.min.mjs contém string de versão 4.2.67', () => {
    const content = fs.readFileSync(path.join(VENDOR_DIR, 'pdf.min.mjs'), 'utf8');
    assert.ok(content.includes('4.2.67'), 'pdf.min.mjs deveria conter v4.2.67');
  });

  it('pdfTasyParser.js chama getDocument com isEvalSupported:false', () => {
    const content = fs.readFileSync(path.join(__dirname, '../../src/js/parsers/pdfTasyParser.js'), 'utf8');
    const matches = content.match(/isEvalSupported:\s*false/g);
    assert.ok(matches && matches.length >= 2,
      `Esperado >= 2 ocorrências de isEvalSupported:false, encontrado ${matches?.length ?? 0}`);
  });

  it('app.js não usa window.pdfjsLib no código ativo (ESM não expõe global)', () => {

    const content = fs.readFileSync(APP_JS, 'utf8');
    const codeLines = content.split('\n').filter(l => !l.trim().startsWith('//'));
    const code = codeLines.join('\n');
    assert.ok(!code.includes('window.pdfjsLib'),
      'app.js não deveria referenciar window.pdfjsLib em código ativo');
  });

  it('validateRuntimeDependencies não checa window.pdfjsLib no código ativo', () => {
    const content = fs.readFileSync(APP_JS, 'utf8');

    const fnMatch = content.match(/function validateRuntimeDependencies\(\)[^{]+\{[\s\S]*?\n\}/);
    const fn = fnMatch ? fnMatch[0] : '';
    const fnLines = fn.split('\n').filter(l => !l.trim().startsWith('//'));
    const fnCode = fnLines.join('\n');
    assert.ok(!fnCode.includes('window.pdfjsLib'),
      'validateRuntimeDependencies não deveria checar window.pdfjsLib');
  });
});

describe('S02: SheetJS 0.20.2 — flags seguros em XLSX.read', () => {
  it('xlsx.full.min.js existe no vendor dir', () => {
    const xlsxFile = path.join(VENDOR_DIR, 'xlsx.full.min.js');
    assert.ok(fs.existsSync(xlsxFile), 'xlsx.full.min.js deveria existir');
  });

  it('XLSX.version é 0.20.x (runtime check)', async () => {
    const { makeXlsxSandbox } = await import('../_helpers/fileMock.mjs');
    const sandbox = makeXlsxSandbox();
    assert.ok(
      sandbox.window.XLSX.version?.startsWith('0.20.'),
      `Esperado XLSX.version >= 0.20.0, obtido '${sandbox.window.XLSX.version}'`
    );
  });

  it('fileReaders.js chama XLSX.read com bookVBA, cellHTML, cellFormula desabilitados', () => {
    const content = fs.readFileSync(path.join(__dirname, '../../src/js/parsers/fileReaders.js'), 'utf8');
    const flags = ['bookVBA: false', 'cellHTML: false', 'cellFormula: false'];
    for (const flag of flags) {
      assert.ok(content.includes(flag),
        `fileReaders.js deveria conter ${flag}`);
    }
  });
});

describe('index.html — defer dos vendors', () => {
  it('não carrega pdf.min.js UMD (pdf.js é ESM e carregado lazy)', () => {
    const content = fs.readFileSync(INDEX_HTML, 'utf8');
    assert.ok(!content.includes('pdf.min.js'),
      'index.html não deve carregar pdf.min.js UMD — pdf.js é ESM lazy');
  });

  it('papaparse e xlsx carregam com defer', () => {
    const content = fs.readFileSync(INDEX_HTML, 'utf8');
    assert.ok(content.includes('src/vendor/papaparse.min.js'),
      'papaparse.min.js deveria estar em index.html');
    assert.ok(content.includes('src/vendor/xlsx.full.min.js'),
      'xlsx.full.min.js deveria estar em index.html');
  });

  it('app.js carrega como module (ES6 implicit deferred)', () => {
    const content = fs.readFileSync(INDEX_HTML, 'utf8');
    assert.ok(content.includes('type="module"'),
      'app.js deveria carregar como type="module"');
    assert.ok(!content.includes('defer') || !content.match(/app\.js.*defer/),
      'app.js module não precisa de defer explícito (ES6 spec)');
  });
});

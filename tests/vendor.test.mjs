import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const VENDOR_DIR = resolve(PROJECT_ROOT, 'src', 'vendor');
const INDEX_HTML = resolve(PROJECT_ROOT, 'index.html');
const PDF_PARSER = resolve(PROJECT_ROOT, 'src', 'js', 'parsers', 'pdfTasyParser.js');

function sha384(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha384').update(buf).digest('base64');
}

function sha256Hex(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function extractVersion(content) {

  let matches = [...content.matchAll(/[a-zA-Z_$]\.version\s*=\s*["'](\d+\.\d+\.\d+)["']/g)];
  if (matches.length) return matches[0][1];
  let m = content.match(/\bv(\d+\.\d+\.\d+)\b/);
  if (m) return m[1];
  m = content.match(/(?:Papa\.)?VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/);
  if (m) return m[1];
  return null;
}

function extractIntegrity(html, vendorFilename) {
  const esc = vendorFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<script\\b[^>]+src=["']src/vendor/${esc}\\?v=[^"']+["'][^>]*integrity=["']sha384-([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractVersionQuery(html, vendorFilename) {
  const esc = vendorFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<script\\b[^>]+src=["']src/vendor/${esc}\\?v=([0-9.]+)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractLinkIntegrity(html, assetPath) {
  const esc = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<link\\b[^>]+href=["']${esc}(?:\\?v=[^"']+)?["'][^>]*integrity=["']sha384-([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractLinkVersionQuery(html, assetPath) {
  const esc = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<link\\b[^>]+href=["']${esc}\\?v=([0-9.]+)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractPinnedSha256(source, constName) {
  const re = new RegExp(`${constName}\\s*=\\s*['"]([a-f0-9]{64})['"]`);
  const m = source.match(re);
  return m ? m[1] : null;
}

describe('vendor/xlsx.full.min.js — SRI e versão', () => {
  const vendorPath = resolve(VENDOR_DIR, 'xlsx.full.min.js');
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('SRI sha384 em index.html bate com SHA-384 real do vendor', () => {
    const declared = extractIntegrity(html, 'xlsx.full.min.js');
    assert.ok(declared, 'integrity="sha384-..." ausente para xlsx.full.min.js em index.html');
    const actual = sha384(vendorPath);
    assert.equal(
      actual, declared,
      `SRI drifted. Recalcule com:\n  openssl dgst -sha384 -binary src/vendor/xlsx.full.min.js | openssl base64 -A\n  Atualize integrity="sha384-${actual}" em index.html`,
    );
  });

  it('?v= em index.html bate com a versão real do vendor', () => {
    const qVer = extractVersionQuery(html, 'xlsx.full.min.js');
    const content = readFileSync(vendorPath, 'utf8');
    const realVer = extractVersion(content);
    assert.ok(qVer, '?v= ausente para xlsx.full.min.js em index.html');
    assert.ok(realVer, 'não foi possível extrair versão do vendor');
    assert.equal(
      qVer, realVer,
      `?v=${qVer} mas vendor é ${realVer}. Atualize ?v=${realVer} em index.html`,
    );
  });

  it('versão do vendor >= 0.20.2 (sem CVEs GHSA-4r6h-8v6p-xvw6 e GHSA-5pgg-2g8v-xvw6)', () => {
    const content = readFileSync(vendorPath, 'utf8');
    const ver = extractVersion(content);
    assert.ok(ver, 'não foi possível extrair versão do vendor');
    const [major, minor, patch] = ver.split('.').map(Number);
    const ok = major > 0
      || (major === 0 && minor > 20)
      || (major === 0 && minor === 20 && patch >= 2);
    assert.ok(
      ok,
      `xlsx ${ver} tem CVEs HIGH. Atualize vendor para >= 0.20.2:\n` +
      `  npm install xlsx@0.20.3 --no-save\n` +
      `  cp node_modules/xlsx/dist/xlsx.full.min.js src/vendor/\n` +
      `  Recalcule SRI e atualize index.html`,
    );
  });
});

describe('vendor/papaparse.min.js — SRI e versão', () => {
  const vendorPath = resolve(VENDOR_DIR, 'papaparse.min.js');
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('SRI sha384 em index.html bate com SHA-384 real do vendor', () => {
    const declared = extractIntegrity(html, 'papaparse.min.js');
    assert.ok(declared, 'integrity="sha384-..." ausente para papaparse.min.js em index.html');
    const actual = sha384(vendorPath);
    assert.equal(actual, declared, 'SRI drifted para papaparse');
  });

  it('versão do vendor >= 5.4.1', () => {
    const content = readFileSync(vendorPath, 'utf8');
    const ver = extractVersion(content);
    assert.ok(ver, 'não foi possível extrair versão do vendor');
    const [major, minor] = ver.split('.').map(Number);
    assert.ok(
      major > 5 || (major === 5 && minor >= 4),
      `papaparse ${ver} é antigo. Atualize para >= 5.4.1.`,
    );
  });
});

describe('vendor/pdf.js — hashes pinned em pdfTasyParser.js', () => {
  const pdfPath = resolve(VENDOR_DIR, 'pdf.min.mjs');
  const workerPath = resolve(VENDOR_DIR, 'pdf.worker.min.mjs');
  const parserSrc = readFileSync(PDF_PARSER, 'utf8');

  it('PDFJS_EXPECTED_HASH em pdfTasyParser.js bate com SHA-256 real do pdf.min.mjs', () => {
    const pinned = extractPinnedSha256(parserSrc, 'PDFJS_EXPECTED_HASH');
    assert.ok(pinned, 'PDFJS_EXPECTED_HASH não encontrado em pdfTasyParser.js');
    const actual = sha256Hex(pdfPath);
    assert.equal(
      actual, pinned,
      `hash drifted para pdf.min.mjs. Atualize PDFJS_EXPECTED_HASH em pdfTasyParser.js:\n` +
      `  node -e "const c=require('crypto'),fs=require('fs');console.log(c.createHash('sha256').update(fs.readFileSync('src/vendor/pdf.min.mjs')).digest('hex'))"`,
    );
  });

  it('PDFJS_WORKER_EXPECTED_HASH em pdfTasyParser.js bate com SHA-256 real do pdf.worker.min.mjs', () => {
    const pinned = extractPinnedSha256(parserSrc, 'PDFJS_WORKER_EXPECTED_HASH');
    assert.ok(pinned, 'PDFJS_WORKER_EXPECTED_HASH não encontrado em pdfTasyParser.js');
    const actual = sha256Hex(workerPath);
    assert.equal(
      actual, pinned,
      `hash drifted para pdf.worker.min.mjs. Atualize PDFJS_WORKER_EXPECTED_HASH em pdfTasyParser.js:\n` +
      `  node -e "const c=require('crypto'),fs=require('fs');console.log(c.createHash('sha256').update(fs.readFileSync('src/vendor/pdf.worker.min.mjs')).digest('hex'))"`,
    );
  });
});

describe('styles/dashboard.css — SRI em <link rel="stylesheet">', () => {
  const cssPath = resolve(PROJECT_ROOT, 'src', 'styles', 'dashboard.css');
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('SRI sha384 do <link rel="stylesheet"> em index.html bate com SHA-384 real do CSS', () => {
    const declared = extractLinkIntegrity(html, 'src/styles/dashboard.css');
    assert.ok(
      declared,
      'integrity="sha384-..." ausente para <link rel="stylesheet" href="src/styles/dashboard.css"> em index.html',
    );
    const actual = sha384(cssPath);
    assert.equal(
      actual, declared,
      `SRI drifted para dashboard.css. Recalcule com:\n` +
      `  openssl dgst -sha384 -binary src/styles/dashboard.css | openssl base64 -A\n` +
      `  Atualize integrity="sha384-${actual}" em index.html`,
    );
  });

  it('?v= do <link rel="stylesheet"> em index.html está presente', () => {
    const qVer = extractLinkVersionQuery(html, 'src/styles/dashboard.css');
    assert.ok(qVer, '?v= ausente para <link rel="stylesheet" href="src/styles/dashboard.css"> em index.html');
    assert.match(qVer, /^\d+\.\d+\.\d+$/, '?v= deve estar no formato X.Y.Z');
  });
});

describe('node_modules sanity — sem deps dead/extraneous', () => {
  it('xlsx não está instalado em node_modules (vendor é a fonte)', () => {
    let exists = false;
    try {
      readFileSync(resolve(PROJECT_ROOT, 'node_modules', 'xlsx', 'package.json'), 'utf8');
      exists = true;
    } catch {}
    assert.equal(
      exists, false,
      'node_modules/xlsx existe mas não é usado em src/ nem tests/.\n' +
      '  Remova "xlsx" de dependencies em package.json e regenere o lockfile.',
    );
  });

  it('playwright não está em dependencies (não há tests/e2e/)', () => {
    const pkgRaw = readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    assert.equal(
      pkg.dependencies?.playwright, undefined,
      'playwright não deve estar em dependencies (não há tests/e2e/)',
    );
    assert.equal(
      pkg.devDependencies?.playwright, undefined,
      'playwright não deve estar em devDependencies (não há tests/e2e/)',
    );
  });
});
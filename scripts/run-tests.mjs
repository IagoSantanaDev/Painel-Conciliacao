#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(HERE, '..', '..');
const TESTS_ROOT = join(PROJECT_ROOT, 'tests');

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.mjs')) {
      out.push(fullPath);
    }
  }
  return out;
}

const files = findTestFiles(TESTS_ROOT);
if (files.length === 0) {
  console.error('Nenhum arquivo *.test.mjs encontrado em ' + TESTS_ROOT);
  process.exit(2);
}

const passthrough = process.argv.slice(2).filter((arg) => arg !== '--test');

const child = spawn(process.execPath, ['--test', ...files, ...passthrough], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

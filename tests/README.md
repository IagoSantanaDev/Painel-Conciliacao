# Testes do Painel Conciliação

## Como rodar

```bash
npm test
```

Ou diretamente:

```bash
node scripts/run-tests.mjs
```

`scripts/run-tests.mjs` enumera recursivamente todos os arquivos `*.test.mjs` em `tests/` e os executa via `node --test`. Funciona em Windows, Linux e macOS.

523 testes em 82 suítes, ~400ms.

## Estrutura

```
tests/
├── README.md
├── _helpers/
│   └── fileMock.mjs              mockCsvFile, makeXlsxSandbox, setupBrowserGlobals, teardownBrowserGlobals
├── _smoke.test.mjs               Contratos públicos (exports estáveis) e parity
├── vendor.test.mjs               SRI/version dos vendors (xlsx, papaparse, pdf.js), SRI do CSS, hygiene de package.json
├── utils/
│   ├── format.test.mjs           parseMoneyBR, parseMoneyBRStrict, normalizeAuth
│   ├── formatExports.test.mjs    formatMoney, normalizePaymentMethod, normalizeCardType, normalizeBrand,
│   │                             getValue, getValueContains, isSummaryRow, getString, getMoney,
│   │                             createId, normalizePdfBrand, HEADER_ALIASES
│   ├── escape.test.mjs           escapeHtml, escapeAttr (incl. backtick)
│   ├── xlsxSanitize.test.mjs     sanitizeXlsxCellValue (CWE-1236), todos FORMULA_LEADING_CHARS, truncamento 32767
│   ├── normalizeText.test.mjs    normalizeText, normalizeHeader (= normalizeText), RE_ACCENT
│   ├── dedupe.test.mjs           deduplicateByFields
│   └── validateFiles.test.mjs    validateFiles (extensão, tamanho, quantidade, mensagens)
├── parsers/
│   ├── parsers.test.mjs          parseBiMv, parseCielo (via parseSpreadsheet compartilhado), dedup cross-source
│   ├── fileReaders.test.mjs      Magic Bytes (PK spoofing), parseCsvRows, parseWorkbookRows, parseSpreadsheet
│   ├── pdfTasyParser.test.mjs    parseTasyPdf (pdf.js mockado), documentInfo tracker (consume-on-create + RECEIPT_ESPECIE_RX)
│   ├── fixture-empty.pdf         Fixture para testes de parsing
│   └── dedup.test.mjs            deduplicateHospitalRows, findDuplicateAutorizadores, buildCieloIndexWithDedup
├── services/
│   ├── reconciliation.test.mjs   reconcileRows, reconcileOne, buildCieloIndexWithDedup, consumo único Cielo
│   ├── reconcileOneBranches.test.mjs  5 branches de reconcileOne (sem valor, cartão, dinheiro, misto, pós-processamento)
│   ├── exportTd.test.mjs         classifyExportSheet, buildSheetGroups, exportTd, buildTasyCieloRows, defesa formula injection
│   ├── paymentPredicates.test.mjs STATUS_LABEL parity, isCardType, isCardPayment, isCashPayment, buildConsumedCieloIds,
│   │                             Paridade métrica↔filtro Conciliados
│   ├── parsePipeline.test.mjs    mergeParseResults, parseFilesSettled (Promise.allSettled), parseHospitalFiles/parseCieloFiles,
│   │                             deduplicateCrossSourceRows
│   ├── undoStack.test.mjs        createUndoStack — push, undo, redo, clear, limite de 50, defesa contra null, sequencia completa
│   └── statusLabel.test.mjs      getStatusLabel via reconcileOne
├── ui/
│   ├── render.test.mjs           computeMetrics, rowMatchesFilter, rowMatchesSearch, Cielo-only rows sem checkbox
│   ├── chunkedRender.test.mjs    chunkedAppend — rAF scheduler com drivers mockados
│   └── dropZone.test.mjs         setupDropZone (DataTransfer, idempotência), renderAll (smoke)
└── integration/
    └── pipeline.test.mjs         Contratos runtime: validateFiles, pdf.js ESM, SheetJS flags, defer de index.html
```

## Convenções

- **Extensão:** `.test.mjs` — Node.js native test runner (ESM)
- **Importação:** `import` ESM, não `require()`
- **Mocks:** `globalThis` para `window`, `crypto`, `XLSX` antes do `import` dinâmico do módulo testado
- **Assertivas:** `assert.strictEqual`, `assert.deepStrictEqual`, `assert.ok`, `assert.throws`
- **describe/it:** `node:test` built-in (`describe`, `it`, `test`)
- **Cobertura:** `chunkedRender` aceita drivers `requestAnimationFrame`, `cancelAnimationFrame` e `createTemplate` via `options` para mockar rAF sem browser

## Cobertura por arquivo de teste

| Arquivo | Describes | Testes | Escopo |
|---------|----------:|-------:|--------|
| `tests/_smoke.test.mjs` | 1 | 9 | Contratos públicos (exports estáveis) e parity |
| `tests/vendor.test.mjs` | 5 | 11 | SRI sha384 em xlsx/papaparse, hash sha256 em pdf.min/worker pinned em `pdfTasyParser.js`, SRI do `<link rel="stylesheet">`, `?v=` em vendors, hygiene de `package.json`/`package-lock.json` |
| `tests/utils/format.test.mjs` | 3 | 46 | `parseMoneyBR` (BR/US/decimal/whitespace), `parseMoneyBRStrict` (retorna `{value, valid}`), `normalizeAuth` (XSS reject-not-strip) |
| `tests/utils/formatExports.test.mjs` | 12 | 91 | Funções de `format.js` não cobertas por `format.test.mjs`: `formatMoney`, `normalizePaymentMethod`, `normalizeCardType`, `normalizeBrand`, `getValue`, `getValueContains`, `isSummaryRow`, `getString`, `getMoney`, `createId`, `normalizePdfBrand`, `HEADER_ALIASES` |
| `tests/utils/escape.test.mjs` | 2 | 24 | `escapeHtml` e `escapeAttr` (incl. backtick em attribute) |
| `tests/utils/xlsxSanitize.test.mjs` | 1 | 26 | `sanitizeXlsxCellValue` — cobertura de cada char em `FORMULA_LEADING_CHARS` (`=`, `+`, `-`, `@`, `\t`, `\r`, `\n`, `\v`, `\f`), truncamento a 32.767 chars |
| `tests/utils/normalizeText.test.mjs` | 1 | 13 | NFD decomposition, lowercase, collapse spaces, `normalizeHeader === normalizeText` |
| `tests/utils/dedupe.test.mjs` | 2 | 5 | `deduplicateByFields` (preserva ordem, ignora chaves duplicadas), `findDuplicateAutorizadores` |
| `tests/utils/validateFiles.test.mjs` | 1 | 13 | Extensão, 20MB/arquivo, 50/envio, mensagens, lista vazia |
| `tests/parsers/parsers.test.mjs` | 3 | 14 | `parseBiMv` (8 cenários), `parseCielo` (4 cenários), `dedup cross-source` (2 cenários) |
| `tests/parsers/fileReaders.test.mjs` | 4 | 18 | Magic Bytes XLSX/ODS (PK spoofing), `parseCsvRows` (BOM, null bytes), `parseWorkbookRows`, `parseSpreadsheet` |
| `tests/parsers/pdfTasyParser.test.mjs` | 4 | 18 | `parseTasyPdf` smoke com pdf.js mockado, `documentInfo` tracker (consume-on-create + RECEIPT_ESPECIE_RX) |
| `tests/parsers/dedup.test.mjs` | 3 | 16 | `deduplicateHospitalRows`, `findDuplicateAutorizadores`, stats de `buildCieloIndexWithDedup` |
| `tests/services/reconciliation.test.mjs` | 2 | 14 | `reconcileRows`, `reconcileOne` (Pendente, ambíguo, Cielo-only, edicao inline para auth de Conciliada/Divergente/Pendente Concilia via allowReuse, edicao para auth de Nao encontrado na Cielo ganha badge Auth duplicado via getEffectiveRow), double-booking, `buildCieloIndexWithDedup` |
| `tests/services/reconcileOneBranches.test.mjs` | 1 | 13 | 5 branches de `reconcileOne`: sem valor, cartão, dinheiro, misto, pós-processamento |
| `tests/services/exportTd.test.mjs` | 5 | 39 | `classifyExportSheet` (Conciliado+auth dup vai pra Divergentes, Nao encontrado+auth dup vai pra Divergentes, corrigido ainda vai pra Conciliados), `buildSheetGroups`, `exportTd` (TD vs TasyCielo), `buildTasyCieloRows`, defesa formula injection |
| `tests/services/paymentPredicates.test.mjs` | 10 | 38 | `STATUS_LABEL` parity, `isCardType`, `isCardPayment`, `isCashPayment`, `buildConsumedCieloIds`, Paridade métrica↔filtro Conciliados, FILTERS exclui Cielo-only de todos exceto Não Encontrados |
| `tests/services/parsePipeline.test.mjs` | 4 | 8 | `mergeParseResults`, `parseFilesSettled`, `parseHospitalFiles`/`parseCieloFiles`, `deduplicateCrossSourceRows` |
| `tests/services/undoStack.test.mjs` | 1 | 11 | `createUndoStack`: push, undo, redo, clear, limite de 50, defesa contra null, sequencia completa |
| `tests/services/statusLabel.test.mjs` | 1 | 2 | `getStatusLabel` invocado via `reconcileOne` |
| `tests/ui/render.test.mjs` | 9 | 67 | `computeMetrics` (totais BRL + counts), `rowMatchesFilter`, `rowMatchesSearch`, `getEffectiveRow` (auth dup forca Divergente, Cielo-only imutavel), `getDisplayPriority` (Conciliado/Divergente+auth dup = -1, Nao encontrado+auth dup = 999), `sortResultsByPriority` (Conciliado+auth dup no topo, Nao encontrado+auth dup no final), Cielo-only rows sem checkbox, dup badges nao duplicam, todos-filtro exclui Cielo-only |
| `tests/ui/chunkedRender.test.mjs` | 1 | 7 | `chunkedAppend` — chunked rAF scheduler com drivers injetáveis, cancel handle |
| `tests/ui/dropZone.test.mjs` | 2 | 5 | `setupDropZone` (DataTransfer, idempotência via WeakSet), `renderAll` (smoke) |
| `tests/integration/pipeline.test.mjs` | 4 | 15 | Contratos runtime: `validateFiles`, pdf.js ESM `>= 4.2.67` + `isEvalSupported:false`, SheetJS 0.20.2 com flags seguros em `XLSX.read`, `<script defer>` dos vendors em index.html |
| **Total** | **82** | **523** | Cobertura completa de parsers, services, UI, pipeline de parsing, dedup, segurança (XSS/CWE-1236), contratos runtime (vendor SRI/version) |
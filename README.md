# Painel Conciliação

Painel de conciliação de vendas entre **Cielo** (spreadsheet) e **BI/MV** (CSV) + **PDF Tasy** (relatório de vendas).

## Fluxo

1. **Upload**: usuário seleciona arquivos Cielo (CSV/XLSX) e hospitalares (CSV/XLSX ou PDF Tasy)
2. **Parsing**: cada arquivo é parseado para registros normalizados com campos como `autorizador`, `valorBruto`, `valorCartao`, `valorDinheiro`
3. **Reconciliação**: cada venda Cielo é cruzada com as hospitalares por `autorizador` + `valor`; consumo único por linha hospitalar
4. **Visualização**: painel exibe tabela com status badges, métricas por filtro e ordenação
5. **Exportação**: exportação TD/XLSX gera abas mutuamente exclusivas: Conciliados / Cartão / Dinheiro / Divergentes / Não encontrados / Pendentes

## Status canônico

| Condição | `statusLabel` | Badge |
|---|---|---|
| `_cieloOnly === true` | `"Não encontrado"` | warning |
| `corrigido === true` + Dinheiro/Misto | `"Corrigido"` | success |
| `valorCartao > 0` + match Cielo | `"Conciliado"` | success |
| `valorCartao > 0` + match parcial/erro | `"Divergente"` | danger |
| `valorCartao > 0` + nenhum match | `"Pendente"` | warning |
| `valorDinheiro > 0` + sem bloqueadores | `"Dinheiro"` ou `"Pagamento misto"` + `"À Conciliar"` | info/warning |
| Sem autorizador | `"Sem autorizador"` | warning |

Linhas com `corrigido === true` sempre ganham badge `"Corrigido"` (success).

## Filtros (painel + métricas)

| key | label | Predicado |
|---|---|---|
| `todos` | Todos (exclui Cielo-only) | `row => !isCieloOnly(row)` |
| `conciliado` | Conciliados | `row => !isCieloOnly(row) && isOkRowBridge(row)` |
| `corrigido` | Corrigidos | `row => !isCieloOnly(row) && isCorrigido(row)` |
| `cartao` | Cartão | `row => !isCieloOnly(row) && isCardPayment(row)` |
| `credito` | Crédito | `row => !isCieloOnly(row) && isCardType(row, 'credito')` |
| `debito` | Débito | `row => !isCieloOnly(row) && isCardType(row, 'debito')` |
| `dinheiro` | Dinheiro/Espécie | `row => !isCieloOnly(row) && isCashPayment(row)` |
| `divergente` | Divergentes | `row => !isCieloOnly(row) && isDivergente(row)` |
| `naoEncontrado` | Não encontrados (único que inclui Cielo-only) | `isNaoEncontrado` |
| `pendente` | Pendentes | `row => !isCieloOnly(row) && isPendente(row)` |

## Scripts

```bash
npm install          # instala dependências (opcional em prod — vendor commitado)
npm test             # roda os 523 testes (cross-platform via scripts/run-tests.mjs)
```

## Testes

523 testes em 82 suítes, ~400ms. Detalhes em `tests/README.md`.

- `tests/utils/` — `format.js`, `sanitize.js`, `string.js`, `dedupe.js`, `validateFiles.js`
- `tests/parsers/` — `parsers.js` (biMv/cielo via `parseSpreadsheet`), `fileReaders.js`, `dedup.js`, `pdfTasyParser.js`
- `tests/services/` — `reconciliation.js`, `reconcileOneBranches.js`, `exportTd.js`, `paymentPredicates.js`, `parsePipeline.js`, `statusLabel.js`
- `tests/ui/` — `render.js`, `chunkedRender.js`, `dropZone.js`
- `tests/integration/` — pipeline completo de upload + contratos de vendor (pdf.js, SheetJS, defer de index.html)
- `tests/_smoke.test.mjs` — contratos de API exports e parity
- `tests/vendor.test.mjs` — hygiene de `package.json`/`package-lock.json`, SRI dos vendors (xlsx, papaparse, pdf.js), e SRI do CSS

## Estrutura

```
src/
  js/
    constants.js          ID_PREFIX
    parsers/
      _shared.js          findHeaderRowByTokens, assertHeaderFound, parseSpreadsheet, createHospitalRow
      biMvParser.js       parseBiMv
      cieloParser.js      parseCielo
      pdfTasyParser.js    parseTasyPdf, getPdfJs (SRI runtime), RECEIPT_ESPECIE_RX, createDocumentTracker, ingestDocumentInfo, consumeDocumentInfo
      fileReaders.js      parseCsvRows, parseWorkbookRows, rowsToObjects
    services/
      reconciliation.js    reconcileRows, reconcileOne, buildCieloIndexWithDedup
      exportTd.js         exportTd, classifyExportSheet, buildSheetGroups, TD_COLUMNS, TASY_CIELO_COLUMNS, LAYOUTS
      paymentPredicates.js STATUS_LABEL, SHEET_NAME, SHEET_ORDER, BLOCKING_KEYWORDS, FILTERS, EVENTO_PARTICULAR,
                           isOkRowBridge, isNaoEncontrado, isCieloOnly, isCorrigido, isOkRow, isDivergente, isPendente,
                           containsBlockingKeyword, hasBlockingStatus, isCardType, isCardPayment, isCashPayment,
                           buildConsumedCieloIds, withCieloFallback
      parsePipeline.js    parseHospitalFile, parseFilesSettled, parseHospitalFiles, parseCieloFiles, mergeParseResults
      undoStack.js        createUndoStack — undo/redo de edições inline (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) com limite de 50 operações
    ui/
      render.js           renderAll, renderUploadSummary, renderMetrics, computeMetrics, rowMatchesFilter,
                           rowMatchesSearch, getDisplayPriority, sortResultsByPriority, renderTableRow,
                           updateSingleRow, invalidateMetricsCache, showAlert, setLoading
      chunkedRender.js    chunkedAppend (rAF scheduler com drivers injetáveis), CHUNK_SIZE_ROWS
      dropZone.js         setupDropZone
      dom.js              getElements
    utils/
      format.js           parseMoneyBR, parseMoneyBRStrict, formatMoney, normalizeAuth, normalizePaymentMethod,
                           normalizeCardType, normalizeBrand, HEADER_ALIASES, getValue, getValueContains,
                           isSummaryRow, getString, getMoney, createId, normalizePdfBrand
      sanitize.js         escapeHtml, escapeAttr, sanitizeXlsxCellValue (CWE-1236)
      string.js           normalizeText, normalizeHeader, RE_ACCENT
      dedupe.js           deduplicateByFields, deduplicateCrossSourceRows, deduplicateHospitalRows,
                           findDuplicateAutorizadores, emptyParseResult,
                           HOSPITAL_DEDUPE_KEY, CIELO_DEDUPE_KEY, CROSS_SOURCE_DEDUPE_KEY
      fileExt.js          SPREADSHEET_EXTENSIONS, HOSPITAL_EXTENSIONS, getFileExt, isPdfFile, isCsvFile, isSpreadsheetFile
      validateFiles.js    validateFiles, MAX_BYTES_PER_FILE, MAX_FILES_PER_UPLOAD
    app.js                state + event handlers, window-level drag preventer, generation token,
                           beforeunload cleanup, undo/redo (Ctrl+Z / Ctrl+Y) listener global,
                           SEARCH_DEBOUNCE_MS
  styles/
    dashboard.css         design tokens, print, reduced-motion, focus-visible
  vendor/
    papaparse.min.js      v5.4.1 (SRI sha384)
    xlsx.full.min.js      v0.20.2 (SRI sha384)
    pdf.min.mjs           v4.2.67 (SRI sha256 runtime + import)
    pdf.worker.min.mjs    v4.2.67 (SRI sha256 runtime)
  assets/
    favicon.png
    manifest.json         PWA manifest mínimo
```

## Segurança

- **CSP estrita** via `_headers` do Cloudflare Pages: `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`. HSTS preload + Permissions-Policy completa (camera, mic, geolocation, payment, usb, serial, midi, bluetooth, sensors, etc.).
- **SRI em 2 camadas**:
  - Atributo `integrity=` em `<script>` HTML para papaparse e xlsx
  - Verificação SHA-256 em runtime via `crypto.subtle.digest` para `pdf.min.mjs` E `pdf.worker.min.mjs` (antes do import)
- **SheetJS** com flags seguras: `bookVBA: false, cellHTML: false, cellFormula: false`
- **pdf.js v4.2.67** com `isEvalSupported: false` em 2 paths (primary + fallback). Limite de `MAX_PDF_PAGES = 2000` para DoS. Timeout de 10s por `getPage`/`getTextContent`.
- **Validação rigorosa de input**:
  - `validateFiles`: extensão + 20MB/arquivo + 50 arquivos/envio
  - `magic bytes` XLSX/ODS (PK\x03\x04) e CSV (sem null bytes em 512B iniciais)
  - `getFileExt` regex restritivo: `[a-z0-9]{1,10}` (ignora path traversal e `.tar.gz → 'gz'`)
- **Window-level drop preventer** em `app.js`: previne navegação default quando arquivo é solto fora da drop zone
- **XSS surface limpa**: `escapeHtml`/`escapeAttr` em todos os call-sites de `innerHTML`. `metricsGrid` usa `replaceChildren` + DOM API. `parseSpreadsheet` constrói header normalizer uma vez por arquivo.
- **Formula injection defense (CWE-1236)**: input layer (`normalizeAuth` rejeita `=`, `;`, `&`, etc.) + export layer (`sanitizeXlsxCellValue` prefixa `'` em cells que começam com `=`, `+`, `-`, `@`, `\t`, `\r`, `\n`, `\v`, `\f`). Truncamento a 32.767 chars (limite Excel).
- **Sem localStorage**: dados financeiros em memória only, limpos em `beforeunload`
- **createId**: prefix+index quando fornecido, `crypto.randomUUID` como fallback

## Acessibilidade

- Landmarks nomeados: `aria-labelledby` em todas `<section>`, `<header class="hero">` em vez de `<section>`
- Tabela: `<caption class="sr-only">` + `<th scope="col">` em todas as colunas
- `:focus-visible` em inputs e filter buttons (não `:focus` — não anel em click de mouse)
- `aria-current="true"` no filtro ativo
- `aria-busy` no botão Processar e na região de resultados durante loading
- `aria-label` em inputs monetários da tabela + `inputmode="decimal"`
- `prefers-reduced-motion`: animações desabilitadas para usuários sensíveis
- `@media print`: estilos de impressão (esconde botões/drop-zones, ajusta layout)

## Notas de parsing

- `parseMoneyBR` aceita BR (`1.234,56`), US (`1,234.56`), plain decimal; rejeita formato misto ambiguo
- `parseMoneyBRStrict` retorna `{ value, valid }` — usado em edição inline da tabela para distinguir entrada vazia de valor inválido
- `normalizeAuth` rejeita (não strippa) chars XSS/formula — produz `''` para input suspeito. Cobre `&<>"'`=;(){}[]` no primeiro char
- `HEADER_ALIASES` cobre 7 grafias para "parcelas" (`Parcelas`, `Quantidade de parcelas`, `Qtd parcelas`, `Número de parcelas`, `Plano`, etc.)
- PDF Tasy: marcação de cartão vs dinheiro por regex em cada linha; cash rows geram `formaPagamento: 'ESPÉCIE'`
- PDF Tasy: `RECEIPT_ESPECIE_RX` (pré-compilado, exportado para testes) casa com `CX - Recebimento Espécie` E `Especie` (com/sem acento)
- PDF Tasy: `currentDocumentInfo` (título) é compartilhado entre autorizações até aparecer outro `CX - Recebimento de Título Particular`; `consumeDocumentInfo` é chamado APENAS quando uma row é efetivamente criada
- `parsePipeline` usa `Promise.allSettled` em `parseFilesSettled` — falha de um arquivo não bloqueia o lote
- `deduplicateCrossSourceRows` colapsa duplicatas entre BI/MV e PDF Tasy usando chave canônica de 14 campos (registro, contaFatura, dataPagamento, horaPagamento, autorizador, autorizadorDoc, valorCartao, valorDinheiro, valorFatura, bandeira, formaPagamento, parcelas, lote, caixa)

## Deploy

100% estático. Deploy via Cloudflare Pages (Git connect ou direct upload). `_headers` na raiz configura CSP + cache para vendor/ e src/js/.

### Cache-busting

Vendor files usam `Cache-Control: max-age=86400, stale-while-revalidate=604800` (1 dia fresh, 7 dias SWR). O query string `?v=` no HTML força reload em updates (ex: `xlsx.full.min.js?v=0.20.2`).

### Vendor management

- SRI do HTML (sha384) é a primeira linha de defesa para papaparse/xlsx
- SRI em runtime (sha256 via crypto.subtle) cobre pdf.min.mjs E pdf.worker.min.mjs
- Para atualizar vendor: substituir arquivo, regenerar hash (`openssl dgst -sha384 -binary <file> | openssl base64 -A` para HTML; `openssl dgst -sha256 -binary` para pdf), atualizar constantes em `pdfTasyParser.js` e query string no HTML
- `src/vendor/*` é marcado como `binary` em `.gitattributes` para impedir normalização EOL que alteraria os hashes
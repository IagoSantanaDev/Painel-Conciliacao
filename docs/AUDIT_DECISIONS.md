# Decisões da Auditoria Consolidada

Documento de referência para decisões tomadas durante a auditoria consolidada de 56 itens (3🔴 + 16🟠 + 22🟡 + 15🟢).
Complementa `.gsd/KNOWLEDGE.md` (estado local) e `.gsd/DECISIONS.md` (decisões formais GSD).

## Itens NÃO aplicados (decisão consciente)

### C2 — `'wasm-unsafe-eval'` no CSP

**Status**: Backlog persistente. NÃO remover do `_headers:9`.

**Por quê**:
- pdf.js v4.2.67 embute codecs WASM (JPEG2000/JBIG2) em base64 no bundle.
- CSP precisa de `'wasm-unsafe-eval'` para `WebAssembly.compile()` desse WASM embutido funcionar.
- Remover exige build custom do pdf.js **sem WASM inline** — projeto não tem build step.
- Breakage de parsing PDF Tasy (imagens JPEG2000) seria pior que ganho marginal de segurança.

**Defesas já em vigor (cobrindo o risco real)**:
- SRI runtime em `pdf.min.mjs` + `pdf.worker.min.mjs` via `_verifyHash` em `pdfTasyParser.js`.
- CSP `script-src 'self'`: bloqueia carregamento de scripts externos. `'wasm-unsafe-eval'` só amplifica risco se WASM malicioso puder ser carregado — não é o caso.
- SRI via `<link integrity>` em CSS (`index.html`).

**Quando revisitar**: se pdf.js v5+ remover WASM embutido por padrão, ou se projeto ganhar build step e puder customizar pdf.js.

---

### M8 — Exports sem consumidor

**Status**: FALSO POSITIVO do auditor. **Nada a aplicar**.

**Análise via script** (cruzar `export` × `import` em src/ e tests/):

11 exports parecem "orfãos" pelo scanner simples do auditor. Verificação manual mostra que **TODOS têm consumidor legítimo**:

| Categoria | Exports | Mecanismo de consumo |
|---|---|---|
| Constantes re-exportadas | `HOSPITAL_DEDUPE_KEY`, `BLOCKING_KEYWORDS`, `HEADER_ALIASES`, `MAX_BYTES_PER_FILE`, `MAX_FILES_PER_UPLOAD` | Consumidas pelo próprio módulo (closure). Exportação permite teste isolado e reuso futuro. |
| Helpers internos | `getDisplayPriority`, `parseHospitalFile` | Chamados por closure/ref (não import literal). `parseHospitalFile` virou argumento de `files.map(parser)` no A6. |
| Consumidos só em testes | `buildSheetGroups`, `TD_COLUMNS`, `TASY_CIELO_COLUMNS` | Usados em `tests/services/exportTd.test.mjs`. Padrão recomendado para ESM (sem `internal` keyword). |

**Decisão**: manter todos os exports. Não há dead code real no projeto. Heurística "export sem import em outro arquivo" produz falsos positivos para ESM porque ignora consumo via closure e via testes.

---

### M11 — Decompor `reconcileOne`

**Status**: Refactor custoso, NÃO aplicado neste ciclo.

Função `reconcileOne` em `src/js/services/reconciliation.js` tem 98 linhas e 5 responsabilidades distintas em sequência:

1. Inicialização do result (spread + campos vazios)
2. Branch "Sem valor" (valorCartao=0 && valorDinheiro=0)
3. Branch cartão valorCartao>0 (3 sub-ramos: sem auth, ambiguous, found)
4. Branch dinheiro valorDinheiro>0 (misto vs puro, com lógica de desconto)
5. Pós-processamento (dedup, corrigido, À Conciliar, statusLabel)

**Decompor em 4 helpers puros** seria viável (`initResult`, `applyCartaoBranch`, `applyDinheiroBranch`, `applyFinalStatus`), mas tem **4 riscos reais**:

- **Risco 1**: Lógica de desconto recém-corrigida no commit `b299677` (A2). Fórmula `valorDinheiro + descontoNum - valorFatura` foi consertada — mexer nessa sequência pode regredir silenciosamente.
- **Risco 2**: Ordem dos `push` em `result.status` afeta `getStatusLabel` (linhas 213-220) e `getDisplayPriority` em `render.js:215`. Reordenar branches muda labels finais sem warning de teste.
- **Risco 3**: Interação Corrigido + À Conciliar (linhas 145-153) usa `containsBlockingKeyword`, filter `!== 'À Conciliar'` e `hasBlockingStatus` em sequência sensível. Decompor sem testes específicos de cada combinação é arriscado.
- **Risco 4**: Sem testes granulares hoje — cobertura atual é integração via `reconcileOne`. Para decompor com segurança, precisa de 4-6 testes novos por branch (~3-4h).

**Custo vs Benefício**:
- Custo: ~3-4h + risco de regressão em lógica financeira
- Benefício: estética de código, testabilidade marginal, zero reuso imediato

**Quando revisitar**:
1. Adicionar nova forma de pagamento (PIX, voucher, cripto) que faria função explodir > 150 linhas
2. Bug recorrente em reconcileOne indicando complexidade causando erro humano
3. Necessidade de teste granular explícita (property-based testing do branch dinheiro)

---

### B7 — Pre-commit hook (husky/lint-staged)

**Status**: NÃO aplicado.

Fricção > valor para projeto solo. CI workflow (B6) já detecta problemas antes do merge.

---

## Itens aplicados

Ver `git log KAN-02` para histórico completo. Resumo:

| Commit | Item | Categoria |
|--------|------|-----------|
| `e35d7d8` | C1 | CSS SRI + cache-busting |
| `d519f8f` | C3 | normalizeAuth regex estendido |
| `60d6416` | B14 | normalizeAuth warning |
| `c9ef507` | B1 | delete pdfjs-mock-loader.mjs |
| `9ed3b26` | B4+B5 | README 245→305 testes |
| `c1a0e25` | B10 | String(index) data-index |
| `014758b` | A15 | crypto.subtle guard |
| `d6cccb2` | A14+M21 | link rel=stylesheet SRI |
| `7639ecc` | M22+M20 | ZIP magic bytes + LF formula |
| `5399568` | A1 | parseMoneyBR whitespace warning |
| `b299677` | A2 | parseMoneyBR desconto + fórmula |
| `94246a7` | M13 | pickCieloSale isExact cache |
| `7f87ef7` | M6 | groupPdfTextItems O(n²)→O(n log n) |
| `6f6870c` | M9 | ID_PREFIX constants.js |
| `5c7c677` | M15 | magic numbers nomeados |
| `b36ecb5` | M19+M20 | smoke tests + 50/51 boundary + BOM |
| `af728d8` | A6 | Promise.all → Promise.allSettled |
| `61dbb37` | M2 | rowMatchesSearch perf |
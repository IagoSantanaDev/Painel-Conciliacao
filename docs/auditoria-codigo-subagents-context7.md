# Auditoria de código com subagents e Context7

Data: 2026-06-10
Projeto: Painel Conciliação

## Escopo

Auditoria do projeto estático JavaScript para procurar erros, bugs, falhas, código morto, melhorias de performance, segurança e longevidade.

Foram usados:

- Subagents:
  - `reviewer`
  - `security`
  - `javascript-pro`
  - `tester`
  - `refactorer`
- Context7:
  - `/mozilla/pdf.js`
  - `/websites/sheetjs`
  - `/mholt/papaparse`
- Verificações locais:
  - `node --check` em todos os módulos JavaScript
  - reprodução isolada de bug em `reconcileOne()`
  - busca por referências e código morto com `rg`

## Resumo executivo

### Severidade alta

1. **Bug real de integridade: linha editada mantém venda Cielo antiga**
   - Confirmado por reprodução local.
   - Pode gerar exportação com dados de Cielo incorretos.

2. **Exportar e limpar continuam possíveis durante processamento**
   - Risco de exportar estado antigo ou sobrescrever estado após limpeza.

### Severidade média

3. Warnings de parser são acumulados, mas não aparecem para o usuário.
4. Erros do PapaParse viram `console.warn`, mas o fluxo continua.
5. SheetJS não valida workbook vazio/corrompido antes de acessar a primeira aba.
6. PDF.js não destrói documento carregado com `pdf.destroy()`.
7. Parsing e renderização podem travar com arquivos grandes.
8. Parser PDF Tasy está grande, acoplado e difícil de testar.
9. Duplicidade de autorizador promete seleção manual, mas a UI não tem seleção.

### Severidade baixa

10. Código morto/duplicado: `parseCsvObjects`, `rowsToObjects` duplicado, `parsedInfo`.
11. `crypto.randomUUID` pode quebrar em ambiente sem `crypto`.
12. `URL.revokeObjectURL()` é chamado imediatamente após clique.
13. Dependências vendorizadas não têm manifesto de versão/hash/origem.
14. Logs diretos em `console.*` sem superfície diagnóstica para usuário/agente.

## Achados prioritários

### P0 — Corrigir antes de confiar na exportação

#### 1. Bug confirmado: Cielo antiga fica presa após edição

Arquivos:

- `src/js/services/reconciliation.js`
- `src/js/app.js`
- `src/js/services/exportTd.js`

`reconcileOne()` reaproveita dados da linha anterior:

```js
cielo: row.cielo || null,
valorCielo: row.valorCielo || 0,
diferenca: row.diferenca || 0,
```

Isso preserva uma venda Cielo antiga mesmo quando uma nova reconciliação não encontra mais venda.

Reprodução local:

```json
{
  "status": ["Não encontrado na Cielo"],
  "statusLabel": "Não encontrado",
  "retainedCielo": true,
  "valorCielo": 100,
  "diferenca": 0
}
```

Impacto: a linha aparece com badge **Não encontrado na Cielo** e status agrupado **Não encontrado**, mas internamente ainda possui `cielo`. A exportação pode usar `row.cielo` antigo para data banco, valor banco, parcela ou POS.

Correção sugerida:

- Em `reconcileOne()`, zerar `cielo`, `valorCielo` e `diferenca` por padrão.
- Preencher `cielo` somente quando o match atual confirmar uma venda.
- Preservar `row.cielo` apenas no fluxo `origem === 'CIELO_SEM_SISTEMA'`.

#### 2. Exportar e limpar ficam ativos durante processamento

Arquivos:

- `src/js/ui/render.js`
- `src/js/app.js`

`setLoading()` desabilita o botão de processar, mas não bloqueia exportação/limpeza.

Cenário de falha:

1. Usuário processa arquivo A.
2. Inicia processamento do arquivo B.
3. Enquanto B está carregando, clica em Exportar.
4. O sistema exporta o resultado antigo A.
5. Ou o usuário limpa e o processamento B termina depois, repovoando a tela.

Correção sugerida:

```js
export function setLoading(el, state, loading) {
  el.processBtn.disabled = loading;
  el.clearBtn.disabled = loading;
  el.exportBtn.disabled = loading || !state.dadosFinal.length;
}
```

Adicionar token de execução:

```js
let processToken = 0;

async function processar() {
  const token = ++processToken;
  const result = await Promise.all(...);
  if (token !== processToken) return;
}
```

Em `limparArquivos()`:

```js
processToken++;
```

## P1 — Dados incompletos ou silenciosamente errados

### 3. Warnings são guardados, mas não exibidos

Arquivo: `src/js/app.js`

O app monta `state.warnings`, mas a UI não mostra esses avisos.

Impacto: o PDF pode ter autorização sem valor ou linhas ignoradas e o usuário recebe sucesso.

Correção sugerida:

- Mostrar bloco “Avisos da importação”.
- No mínimo, incluir os primeiros warnings no alerta final.

### 4. PapaParse continua mesmo com erros

Arquivo: `src/js/parsers/fileReaders.js`

Hoje erros são enviados para `console.warn`, mas o parser resolve com dados possivelmente parciais.

Context7/PapaParse confirma que a biblioteca retorna `results.errors` e suporta `worker`, `step`, `complete`, `error`.

Correção sugerida:

- Separar warning tolerável de erro fatal.
- Propagar erro para `showAlert`.
- Guardar warnings visíveis para o usuário.

### 5. SheetJS sem validação de workbook

Arquivo: `src/js/parsers/fileReaders.js`

O código assume que existe primeira aba:

```js
const sheet = workbook.Sheets[workbook.SheetNames[0]];
```

Context7/SheetJS confirma que `XLSX.read(u8)` com `Uint8Array` é válido, mas o resultado deve ser validado.

Correção sugerida:

```js
if (!workbook.SheetNames.length) {
  throw new Error('A planilha não possui abas legíveis.');
}
```

Também envolver `XLSX.read` com `try/catch` para mensagem de domínio.

### 6. Duplicidade Cielo pede seleção, mas não há UI para selecionar

Arquivo: `src/js/services/reconciliation.js`

A mensagem diz “selecione a venda correta antes de exportar”, mas a tabela não renderiza candidatos nem seletor.

Correção sugerida:

- Persistir `cieloCandidates`.
- Renderizar seletor quando `Pendente revisão`.
- Salvar `selectedCieloId`.
- Fazer `reconcileOne()` respeitar a seleção manual.

## P2 — Performance e longevidade

### 7. Arquivos inteiros são materializados várias vezes

Arquivos:

- `src/js/parsers/fileReaders.js`
- `src/js/parsers/biMvParser.js`
- `src/js/parsers/cieloParser.js`
- `src/js/parsers/pdfTasyParser.js`

Fluxo atual:

- `arrayBuffer`
- decode para string
- parse para matriz
- matriz para objetos
- objetos para modelo final

Impacto: travamento com planilhas/PDFs grandes.

Context7/PapaParse recomenda `worker: true` e `step`/`chunk` para arquivos grandes.

Melhoria sugerida:

- CSV: `Papa.parse(file, { worker: true, step/chunk })`.
- Evitar `rowsToObjects()` intermediário.
- Mapear linha direto para objeto final.
- Para tabela, adicionar paginação/virtualização.

### 8. Renderização recria tudo a cada edição

Arquivo: `src/js/ui/render.js`

`renderAll()` recalcula métricas, filtros e tabela inteira.

Melhorias:

- `computeMetrics()` em uma única passada.
- Atualizar só a linha editada.
- Paginar ou virtualizar tabela.

### 9. `pdfTasyParser.js` concentra responsabilidades demais

Arquivo: `src/js/parsers/pdfTasyParser.js`

Hoje ele faz:

- load/fallback pdf.js
- grouping visual
- regex de linhas Tasy
- extração de título/nota
- extração de cartão/dinheiro
- criação de modelo

Sugestão:

- `pdfLoader.js`
- `pdfTextGrouping.js`
- `tasyLineParser.js`
- `tasyRowFactory.js`

Também otimizar `groupPdfTextItems()`, que pode degradar em páginas com muitos itens.

### 10. pdf.js não é destruído após uso

Arquivo: `src/js/parsers/pdfTasyParser.js`

O parser chama `page.cleanup`, mas não `pdf.destroy()`.

Context7/pdf.js confirma que `getDocument({ data })` trabalha com `TypedArray`; quando usa worker, a memória pode ser transferida. O ciclo de vida do documento deve ser encerrado após processamento.

Correção sugerida:

```js
let pdf;
try {
  pdf = await loadPdfDocument(data);
  // processamento
} finally {
  await pdf?.destroy?.();
}
```

## P3 — Código morto, compatibilidade e manutenção

### 11. Código morto ou duplicado

Achados:

- `src/js/parsers/fileReaders.js`: `parseCsvObjects()` não é usado.
- `src/js/parsers/fileReaders.js`: `rowsToObjects()` exportado.
- `src/js/parsers/biMvParser.js`: `rowsToObjects()` duplicado localmente.
- `src/js/app.js`: `parsedInfo` é salvo/limpo, mas não é consumido.

Sugestão: remover ou centralizar.

### 12. `crypto.randomUUID` pode quebrar em contexto sem `crypto`

Arquivo: `src/js/utils/format.js`

Hoje:

```js
return (crypto.randomUUID && crypto.randomUUID()) || `${prefix}-${Date.now()}-${index}`;
```

Se `crypto` não existir, dá `ReferenceError`.

Correção:

```js
return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${index}`;
```

### 13. `DataTransfer` no drag-and-drop sem fallback

Arquivo: `src/js/app.js`

`new DataTransfer()` pode falhar em alguns browsers/WebViews.

Sugestão:

- Guardar o `File` dropado no estado.
- Ou validar suporte e orientar usar seletor manual.

### 14. `URL.revokeObjectURL()` imediato

Arquivo: `src/js/services/exportTd.js`

Hoje:

```js
link.click();
link.remove();
URL.revokeObjectURL(url);
```

Melhoria:

```js
link.click();
link.remove();
setTimeout(() => URL.revokeObjectURL(url), 0);
```

### 15. Dependências vendorizadas sem manifesto

Arquivos:

- `src/vendor/papaparse.min.js`
- `src/vendor/xlsx.full.min.js`
- `src/vendor/pdf.min.js`
- `src/vendor/pdf.worker.min.js`

Não há:

- `package.json`
- lockfile
- manifesto de versões
- hash
- origem/download
- data de atualização

Impacto: difícil auditar CVEs e garantir que `pdf.min.js` e `pdf.worker.min.js` estão sincronizados.

Sugestão mínima: criar `src/vendor/manifest.json` com nome, versão, arquivos, origem, data e hash.

## Pontos positivos encontrados

- Uso de `escapeHtml` e `escapeAttr` na renderização reduz risco de XSS.
- `pdf.workerSrc` aponta para arquivo local.
- Existe fallback de PDF sem worker.
- `SheetJS.read(new Uint8Array(...))` está alinhado com a documentação do SheetJS.
- Filtro **Não encontrado** agrupa badges que contenham `Não encontrado`, incluindo `Não encontrado na Cielo`.
- Lógica antiga de venda Cielo sem registro hospitalar foi removida; não há mais badge/filtro para esse caso.
- A exportação dedicada Tasy/Cielo separa layout especial.
- O favicon foi movido para `src/assets`.

## Plano recomendado

### Fase 1 — Corrigir bugs de integridade

1. Corrigir `reconcileOne()` para não reter `row.cielo` antigo.
2. Bloquear exportar/limpar durante processamento.
3. Exibir warnings de importação.
4. Validar erros fatais de PapaParse/SheetJS.

### Fase 2 — Testes mínimos

Criar testes com `node:test` sem build pesado:

- `format.js`
- `reconciliation.js`
- `exportTd.js`
- `biMvParser.js`
- `cieloParser.js`
- `pdfTasyParser.js` com `pdfjsLib` mockado

### Fase 3 — Performance/longevidade

1. Centralizar modelos/status.
2. Separar parser PDF em módulos menores.
3. Parser CSV incremental com PapaParse worker.
4. Paginação/virtualização da tabela.
5. Manifesto de vendor libs.

## Recomendação objetiva

Prioridade máxima: corrigir o bug de Cielo antiga retida após edição.

Esse foi o único achado reproduzido diretamente e pode afetar a exportação financeira mesmo quando a tela parece mostrar outro status.

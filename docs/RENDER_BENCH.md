# Render Benchmark — Tabela de Conciliação

Baseline medido em 2026-06-29 (Chrome atual, viewport 1280×800, app rodando localmente).

## Contexto

`renderTabela` (em `src/js/ui/render.js`) monta a tabela de conciliação. Antes do
slice M001-i3sett-S01, usava `tbody.innerHTML = results.map(...).join('')` —
operação síncrona O(N) que bloqueia o main thread durante parse + layout.

Para 50k linhas com HTML realista (~400 bytes/row, 11 células com classes,
inputs editáveis, badges), o custo real é dominado por DOM insertion (parse
HTML + criação de ~550k elementos DOM) e reflow.

## Metodologia

- Synthetic fixture: 50k rows com mesmo shape de `renderTableRow` real
- `requestAnimationFrame` mockado como `setTimeout(cb, 0)` no benchmark (em
  produção browser dispara ~16ms entre frames)
- Cada teste roda 1× para evitar cache de JIT

## Resultados (50k rows)

| Modo | Tempo total | Tempo por frame | Bloqueio perceptível |
|---|---|---|---|
| **innerHTML síncrono** | ~1021ms (extrapolado de 10k: 204.3ms) | 1 frame = 200-1000ms | Cursor trava, scroll trava, freeze visível |
| **chunked rAF** (500 rows/frame) | 1180ms | 11.8ms médio / 112ms cold-start no 1o chunk | Smooth: vê linhas aparecendo progressivamente |

### Por que chunked é 15% mais lento no TOTAL

- Sync: 1 parse HTML grande + 1 reflow no final
- Chunked: N parses médios + N reflows parciais (mais caro por elemento)

Esse overhead é o **preço de não travar o main thread**. Em UX real, 1021ms de
freeze é muito pior que 1180ms smooth (15% mais lento mas frames sob 16ms).

### Chunk size trade-off

- `CHUNK_SIZE_ROWS = 500` atual
- 100 rows/frame: mais smooth, total ~30% mais lento (1500ms)
- 1000 rows/frame: total mais próximo do sync (~1100ms), mas alguns chunks
  podem exceder 16ms (medido 18-25ms em hardware modesto)

500 é o sweet spot para hardware típico (M2 Pro, i5 moderno). Tunar se
observar regressão em hardware antigo (Raspberry Pi etc).

## Verificação no app real

1. Subir app localmente: `python -m http.server 8765` em `T:/Projetos/Painel Conciliação`
2. Browser DevTools → Performance tab
3. Importar arquivo BI/MV com 50k rows (gerar sintético se necessário)
4. Clicar Processar
5. Confirmar:
   - Sem frame individual > 50ms na gravação
   - Tabela aparece progressivamente (não freeze-then-show)

## Próximas otimizações (se 50k virar rotina)

- **Virtual scroll** (true infinite): só renderiza rows visíveis + buffer.
  Estimado 70% mais rápido para 50k mas adiciona ~200 LOC e quebra a11y de
  screen readers. **Não recomendado** para volume típico (centenas a 5k).
- **Web Worker para parse HTML**: separar parse do main thread. Complexidade
  alta (transferable objects, fragmentação), ganho marginal (~10-15%).
- **Adotar diffing library** (lit-html, morphdom): só atualiza o que mudou.
  Útil para edição inline mas overhead de init não compensa para bulk render.

## Slice

M001-i3sett-S01: Chunked rAF table render
- Implementação: `src/js/ui/chunkedRender.js` (~70 LOC)
- Integração: `src/js/ui/render.js` (`renderTabela` chama `chunkedAppend`)
- Tests: `tests/ui/chunkedRender.test.mjs` (7 testes com rAF mockado)
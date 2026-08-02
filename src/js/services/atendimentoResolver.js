export function resolveAtendimento(rows, atendimentoIndex) {
  if (!atendimentoIndex || !atendimentoIndex.index) return { rows, warnings: [] };

  const index = atendimentoIndex.index;
  const warnings = [];
  let resolvidos = 0;
  let naoEncontrados = 0;

  const resolved = rows.map(row => {
    if (!row.tituloTasy) return row;

    const atendimento = index.get(row.tituloTasy);

    if (atendimento !== undefined) {
      resolvidos++;
      return {
        ...row,
        atendimento,
        atendimentoResolvido: true,
      };
    }

    naoEncontrados++;
    return {
      ...row,
      atendimento: row.tituloTasy,
      atendimentoResolvido: false,
    };
  });

  if (naoEncontrados > 0) {
    warnings.push(`${naoEncontrados} titulo(s) Tasy nao encontrado(s) nas planilhas de atendimento.`);
  }

  return { rows: resolved, warnings };
}

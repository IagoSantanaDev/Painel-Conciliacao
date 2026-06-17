export function getElements() {
  return {
    hospitalFile: document.getElementById('hospitalFile'),
    cieloFile: document.getElementById('cieloFile'),
    hospitalDropZone: document.getElementById('hospitalDropZone'),
    cieloDropZone: document.getElementById('cieloDropZone'),
    hospitalFileName: document.getElementById('hospitalFileName'),
    cieloFileName: document.getElementById('cieloFileName'),
    processBtn: document.getElementById('processBtn'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    alertHost: document.getElementById('alertHost'),
    metricsGrid: document.getElementById('metricsGrid'),
    toolbar: document.getElementById('toolbar'),
    filters: document.getElementById('filters'),
    tableSearch: document.getElementById('tableSearch'),
    resultCount: document.getElementById('resultCount'),
    emptyState: document.getElementById('emptyState'),
    tableWrap: document.getElementById('tableWrap'),
    tabelaBody: document.querySelector('#tabela tbody'),
  };
}

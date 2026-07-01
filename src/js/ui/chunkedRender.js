
export const CHUNK_SIZE_ROWS = 500;

export function chunkedAppend(tbody, htmlStrings, options = {}) {
  const raf = options.requestAnimationFrame || ((cb) => window.requestAnimationFrame(cb));
  const cancelRaf = options.cancelAnimationFrame || ((id) => window.cancelAnimationFrame(id));
  const createTemplate = options.createTemplate || ((html) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t;
  });

  let rafId = null;
  let cursor = 0;
  let cancelled = false;

  function processChunk() {
    if (cancelled) return;
    const end = Math.min(cursor + CHUNK_SIZE_ROWS, htmlStrings.length);
    const chunkHtml = htmlStrings.slice(cursor, end).join('');
    const template = createTemplate(chunkHtml);
    tbody.append(...template.content.childNodes);
    cursor = end;
    if (cursor < htmlStrings.length) {
      rafId = raf(processChunk);
    } else {
      rafId = null;
    }
  }

  if (htmlStrings.length > 0) {
    rafId = raf(processChunk);
  }

  return {
    cancel() {
      cancelled = true;
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
    },
  };
}
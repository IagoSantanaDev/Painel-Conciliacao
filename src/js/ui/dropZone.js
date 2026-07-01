import { validateFiles } from '../utils/validateFiles.js';

const attachedDropZones = new WeakSet();

export function setupDropZone({ dropZone, input, acceptedExtensions, invalidMessage, el, showAlert }) {
  if (attachedDropZones.has(dropZone)) return;
  attachedDropZones.add(dropZone);

  const stopDefaults = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      stopDefaults(event);
      dropZone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
      stopDefaults(event);
      dropZone.classList.remove('is-dragging');
    });
  });

  dropZone.addEventListener('drop', event => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;

    try {
      validateFiles(files, acceptedExtensions, 'Arquivo hospitalar', { customMsg: invalidMessage });
    } catch (err) {
      showAlert(el, 'error', err.message);
      return;
    }

    try {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
    } catch {
      showAlert(el, 'error', 'Toque no campo para selecionar os arquivos neste navegador.');
      return;
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    showAlert(el, '', '');
  });
}

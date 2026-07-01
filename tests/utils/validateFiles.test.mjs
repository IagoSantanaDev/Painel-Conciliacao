import { describe, it, before } from 'node:test';
import assert from 'node:assert';

let validateFiles;

before(async () => {
  const mod = await import('../../src/js/utils/validateFiles.js');
  validateFiles = mod.validateFiles;
});

describe('validateFiles', () => {

  it('passa com extensão válida e tamanho dentro do limite', () => {
    const files = [{ name: 'relatorio.xlsx', size: 1024 }];
    validateFiles(files, ['xlsx', 'csv'], 'Arquivo', { maxBytes: 20 * 1024 * 1024 });
  });

  it('lança erro com extensão inválida', () => {
    const files = [{ name: 'dados.txt', size: 512 }];
    assert.throws(
      () => validateFiles(files, ['xlsx', 'csv'], 'Arquivo'),
      /extensão "\.txt" não permitida/
    );
  });

  it('lança erro com extensão em maiúsculas (case-insensitive)', () => {
    const files = [{ name: 'dados.XLSX', size: 512 }];

    validateFiles(files, ['xlsx', 'csv'], 'Arquivo');
  });

  it('lança erro quando tamanho excede o limite padrão de 20 MB', () => {
    const files = [{ name: 'grande.xlsx', size: 21 * 1024 * 1024 }];
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Arquivo'),
      /excede o limite de 20 MB/
    );
  });

  it('lança erro quando tamanho excede limite customizado', () => {
    const files = [{ name: 'medio.xlsx', size: 3 * 1024 * 1024 }];
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Arquivo', { maxBytes: 2 * 1024 * 1024 }),
      /excede o limite de 2 MB/
    );
  });

  it('passa com lista vazia (sem arquivos)', () => {

    validateFiles([], ['xlsx'], 'Arquivo');
  });

  it('inclui nome do arquivo na mensagem de erro de extensão', () => {
    const files = [{ name: 'planilha.txt', size: 1024 }];
    assert.throws(
      () => validateFiles(files, ['xlsx', 'csv'], 'Arquivo'),
      /planilha\.txt/
    );
  });

  it('inclui tamanho real do arquivo na mensagem de limite', () => {
    const files = [{ name: 'pesado.xlsx', size: 5 * 1024 * 1024 }];
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Arquivo', { maxBytes: 2 * 1024 * 1024 }),
      /pesado\.xlsx.*5\.00 MB/
    );
  });

  it('usa label personalizado na mensagem de erro', () => {
    const files = [{ name: 'cupom.txt', size: 1024 }];
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Cupom Cielo'),
      /Cupom Cielo:/
    );
  });

  it('valida todos os arquivos antes de reportar tamanho', () => {
    const files = [
      { name: 'valido.xlsx', size: 1024 },
      { name: 'invalido.txt', size: 99 * 1024 * 1024 },
    ];
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Arquivo'),
      /invalido\.txt/
    );
  });

  it('50 arquivos passa no default maxFiles (boundary inferior inclusivo)', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ name: `f${i}.xlsx`, size: 1024 }));
    validateFiles(files, ['xlsx'], 'Boundary');
  });

  it('51 arquivos falha no default maxFiles (boundary superior exclusivo)', () => {
    const files = Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.xlsx`, size: 1024 }));
    assert.throws(
      () => validateFiles(files, ['xlsx'], 'Boundary'),
      /51 arquivo\(s\) excede o limite de 50/
    );
  });

  it('MAX_BYTES_PER_FILE exportado = 20 * 1024 * 1024', async () => {
    const mod = await import('../../src/js/utils/validateFiles.js');
    assert.equal(mod.MAX_BYTES_PER_FILE, 20 * 1024 * 1024);
  });
});

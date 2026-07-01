import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeXlsxCellValue } from '../../src/js/utils/sanitize.js';

describe('sanitizeXlsxCellValue — formula injection guard (CWE-1236)', () => {

  it('prefixa com \' quando começa com =', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('=HYPERLINK("http://evil")'),
      '\'=HYPERLINK("http://evil")',
    );
  });

  it('prefixa com \' quando começa com +', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('+cmd|"/c calc"!A0'),
      '\'+cmd|"/c calc"!A0',
    );
  });

  it('prefixa com \' quando começa com -', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('-1+1+SUM(A1:A10)'),
      '\'-1+1+SUM(A1:A10)',
    );
  });

  it('prefixa com \' quando começa com @', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('@SUM(A1)'),
      '\'@SUM(A1)',
    );
  });

  it('prefixa com \' quando começa com TAB (0x09)', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('\tabc'),
      '\'\tabc',
    );
  });

  it('prefixa com \' quando começa com CR (0x0D)', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('\rcalc'),
      '\'\rcalc',
    );
  });

  it('prefixa com \' quando começa com LF (0x0A)', () => {

    assert.strictEqual(
      sanitizeXlsxCellValue('\ncalc'),
      '\'\ncalc',
    );
  });

  it('prefixa com \' quando começa com VT (0x0B) — SheetJS emite verbatim', () => {

    assert.strictEqual(
      sanitizeXlsxCellValue('\v=SUM(A1:A10)'),
      '\'\v=SUM(A1:A10)',
    );
  });

  it('prefixa com \' quando começa com FF (0x0C) — idem VT', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue('\f+cmd|"/c calc"!A0'),
      '\'\f+cmd|"/c calc"!A0',
    );
  });

  it('prefixa com \' quando VT/FF aparecem juntos antes de char perigoso', () => {

    assert.strictEqual(
      sanitizeXlsxCellValue('\v\f=PAYLOAD()'),
      '\'\v\f=PAYLOAD()',
    );
  });

  it('trima 0x20 antes de detectar VT (preserva defesa em strings com space leading)', () => {

    assert.strictEqual(
      sanitizeXlsxCellValue(' \v=SUM(A1)'),
      '\' \v=SUM(A1)',
    );
  });

  it('NÃO prefixa strings que começam com caracteres seguros', () => {
    assert.strictEqual(sanitizeXlsxCellValue('Crédito'), 'Crédito');
    assert.strictEqual(sanitizeXlsxCellValue('AUTH12345'), 'AUTH12345');
    assert.strictEqual(sanitizeXlsxCellValue('18/06/2026'), '18/06/2026');
    assert.strictEqual(sanitizeXlsxCellValue('Débito'), 'Débito');
    assert.strictEqual(sanitizeXlsxCellValue('R$ 100,00'), 'R$ 100,00');
    assert.strictEqual(sanitizeXlsxCellValue('Particular'), 'Particular');
    assert.strictEqual(sanitizeXlsxCellValue('MAQ001'), 'MAQ001');
  });

  it('apenas o PRIMEIRO caractere importa (chars perigosos no meio não acionam)', () => {

    assert.strictEqual(sanitizeXlsxCellValue('A=1'), 'A=1');
    assert.strictEqual(sanitizeXlsxCellValue('texto + algo'), 'texto + algo');
    assert.strictEqual(sanitizeXlsxCellValue('foo@bar'), 'foo@bar');
    assert.strictEqual(sanitizeXlsxCellValue('1+1'), '1+1');
  });

  it('null → string vazia', () => {
    assert.strictEqual(sanitizeXlsxCellValue(null), '');
  });

  it('undefined → string vazia', () => {
    assert.strictEqual(sanitizeXlsxCellValue(undefined), '');
  });

  it('string vazia → string vazia', () => {
    assert.strictEqual(sanitizeXlsxCellValue(''), '');
  });

  it('trunca para 32767 caracteres (limite Excel)', () => {
    const input = 'A'.repeat(50000);
    const result = sanitizeXlsxCellValue(input);
    assert.strictEqual(result.length, 32767);
    assert.strictEqual(result, 'A'.repeat(32767));
  });

  it('trunca APÓS prefixar (preserva defesa em strings longas maliciosas)', () => {

    const input = '=' + 'A'.repeat(49999);
    const result = sanitizeXlsxCellValue(input);
    assert.strictEqual(result.length, 32767);
    assert.strictEqual(result[0], "'");
    assert.strictEqual(result[1], '=');
  });

  it('string no limite exato (32767) NÃO é truncada', () => {
    const input = 'A'.repeat(32767);
    assert.strictEqual(sanitizeXlsxCellValue(input).length, 32767);
  });

  it('converte número positivo para string sem alterar', () => {
    assert.strictEqual(sanitizeXlsxCellValue(0), '0');
    assert.strictEqual(sanitizeXlsxCellValue(100.5), '100.5');
    assert.strictEqual(sanitizeXlsxCellValue(100), '100');
  });

  it('número negativo É prefixado — vetor real (=-1 seria fórmula)', () => {

    assert.strictEqual(sanitizeXlsxCellValue(-1), "'-1");
    assert.strictEqual(sanitizeXlsxCellValue(-100.5), "'-100.5");
  });

  it('booleano true → "true" (sem prefix)', () => {
    assert.strictEqual(sanitizeXlsxCellValue(true), 'true');
  });

  it('booleano false → "false" (sem prefix)', () => {
    assert.strictEqual(sanitizeXlsxCellValue(false), 'false');
  });

  it('prefixa com \' quando trim() revela char perigoso (space+ =)', () => {

    assert.strictEqual(
      sanitizeXlsxCellValue(' =SUM(A1:A10)'),
      '\' =SUM(A1:A10)',
    );
  });

  it('prefixa com \' com whitespace + tab leading', () => {
    assert.strictEqual(
      sanitizeXlsxCellValue(' \t=SUM(A1:A10)'),
      '\' \t=SUM(A1:A10)',
    );
  });

  it('NÃO prefixa quando string é só whitespace', () => {

    assert.strictEqual(sanitizeXlsxCellValue('   '), '   ');
  });
});

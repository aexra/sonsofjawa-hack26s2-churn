import { describe, expect, it } from 'vitest';

import { findViolations } from './check-ui-text.mjs';

describe('check-ui-text', () => {
  it('flags capitalised dictionary values', () => {
    const source = "export const ru = {\n  a: 'Привет',\n  b: 'привет',\n};\n";

    expect(findViolations(source, 'ru.ts')).toEqual([{ line: 2, text: 'Привет' }]);
  });

  it('ignores dictionary keys and allowed words', () => {
    const source = "export const ru = {\n  'Key': 'ID клиента',\n  api: 'API ключ',\n};\n";

    expect(findViolations(source, 'ru.ts')).toEqual([]);
  });

  it('flags capitalised jsx text and attributes', () => {
    const source = '<div aria-label="Закрыть"><p>Текст</p><p>текст</p></div>';

    expect(findViolations(source, 'a.tsx').map((v) => v.text)).toEqual(['Закрыть', 'Текст']);
  });

  it('flags a file format written in capitals', () => {
    expect(findViolations('<p>CSV файл</p>', 'a.tsx').map((v) => v.text)).toEqual(['CSV файл']);
  });

  it('ignores allowed words in jsx text', () => {
    expect(findViolations('<p>ID клиента</p>', 'a.tsx')).toEqual([]);
  });
});

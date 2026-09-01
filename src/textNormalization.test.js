import { describe, expect, it } from 'vitest';
import { normalizeCourseTitle, restoreEnglishWordBoundaries } from './textNormalization';

describe('course title normalization', () => {
  it('restores camel-case English word boundaries', () => {
    expect(normalizeCourseTitle('ComputerNetwork')).toBe('Computer Network');
    expect(normalizeCourseTitle('DigitalLogicCircuits')).toBe('Digital Logic Circuits');
  });

  it('segments common all-caps OCR runs without changing short abbreviations', () => {
    expect(restoreEnglishWordBoundaries('COMPUTERNETWORK')).toBe('COMPUTER NETWORK');
    expect(restoreEnglishWordBoundaries('AI')).toBe('AI');
  });

  it('does not leave artificial spaces between Chinese characters', () => {
    expect(normalizeCourseTitle('数字 逻辑 电路')).toBe('数字逻辑电路');
  });
});

import { describe, expect, it } from 'vitest';
import { makeInitialState, normalizeWeekFontSize, WEEK_FONT_SIZES } from './data';

describe('week timetable font size preferences', () => {
  it('uses the standard size for new and legacy data', () => {
    expect(makeInitialState().settings.weekFontSize).toBe('standard');
    expect(normalizeWeekFontSize(undefined)).toBe('standard');
    expect(normalizeWeekFontSize('unexpected')).toBe('standard');
  });

  it('accepts every supported size', () => {
    expect(WEEK_FONT_SIZES.map(normalizeWeekFontSize)).toEqual(['compact', 'standard', 'large']);
  });
});

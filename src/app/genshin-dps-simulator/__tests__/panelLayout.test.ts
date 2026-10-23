// The minimized panels a reload brings back from storage.
import { describe, expect, it } from 'vitest';

import {
  LABEL_WIDTH,
  parseCritMode,
  parseLabelWidth,
  parseMinimizedPanels,
} from '../_components/timeline/panelLayout';

const none = { chart: false, log: false, event: false, enemy: false };

describe('stored minimized panels', () => {
  it('come back as they were saved', () => {
    expect(
      parseMinimizedPanels(JSON.stringify({ ...none, log: true }))
    ).toEqual({ ...none, log: true });
  });

  it('start with nothing minimized when there is nothing stored', () => {
    expect(parseMinimizedPanels(null)).toEqual(none);
  });

  it('ignore what is not theirs: bad JSON, unknown panels, non-flags', () => {
    expect(parseMinimizedPanels('{oops')).toEqual(none);
    expect(
      parseMinimizedPanels(JSON.stringify({ chart: 'yes', other: true }))
    ).toEqual(none);
  });
});

describe('the stored CRIT mode', () => {
  it('is Rolled only when Rolled was picked; else Average', () => {
    expect(parseCritMode('random')).toBe('random');
    expect(parseCritMode('expected')).toBe('expected');
    expect(parseCritMode(null)).toBe('expected');
    expect(parseCritMode('oops')).toBe('expected');
  });
});

describe('the stored names column width', () => {
  it('comes back as it was saved, rounded', () => {
    expect(parseLabelWidth('276.4')).toBe(276);
  });

  it('stays within its limits', () => {
    expect(parseLabelWidth('20')).toBe(LABEL_WIDTH.min);
    expect(parseLabelWidth('5000')).toBe(LABEL_WIDTH.max);
  });

  it('starts at its default with nothing stored or a bad value', () => {
    expect(parseLabelWidth(null)).toBe(LABEL_WIDTH.initial);
    expect(parseLabelWidth('')).toBe(LABEL_WIDTH.initial);
    expect(parseLabelWidth('wide')).toBe(LABEL_WIDTH.initial);
  });
});

// The minimized panels a reload brings back from storage.
import { describe, expect, it } from 'vitest';

import { parseMinimizedPanels } from '../_components/timeline/panelLayout';

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

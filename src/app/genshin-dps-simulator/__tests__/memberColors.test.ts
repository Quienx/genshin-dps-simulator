import { describe, expect, it } from 'vitest';

import { buildMemberColors } from '../_components/timeline/memberColors';

describe('buildMemberColors', () => {
  it('shades a member from lightest (Normal) to darkest (Burst)', () => {
    const colors = buildMemberColors([
      { characterId: 'varesa', element: 'Electro' },
    ]);
    const { kinds } = colors.get('varesa')!;

    expect(kinds.normal).toContain('bg-violet-200/60');
    expect(kinds.charged).toContain('bg-violet-400');
    expect(kinds.skill).toContain('bg-violet-600');
    expect(kinds.burst).toContain('bg-violet-800');
    expect(kinds.plunge).toBeUndefined();
  });

  it('keeps the shades of a second member of the same element apart', () => {
    const colors = buildMemberColors([
      { characterId: 'arlecchino', element: 'Pyro' },
      { characterId: 'chevreuse', element: 'Pyro' },
    ]);

    expect(colors.get('arlecchino')!.kinds.skill).toContain('bg-orange-600');
    expect(colors.get('chevreuse')!.kinds.skill).toContain('bg-red-600');
  });
});

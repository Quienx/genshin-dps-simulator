// gcsim's elemental application ICD, as data: a group's reset timer and
// its application sequence (1 applies, 0 does not; past its end, none).
import { describe, expect, it } from 'vitest';

import { createIcd } from '../_lib/engine/icd';

const applies = (group: string | undefined, frames: number[]) => {
  const icd = createIcd();
  return frames.map((frame) => icd.applies('tag', group, frame));
};

describe('elemental application ICD groups', () => {
  it('standard: the 1st, 4th, 7th hit, restarting 2.5 s after the first', () => {
    expect(applies(undefined, [0, 10, 20, 30, 40, 50, 60])).toEqual([
      1, 0, 0, 1, 0, 0, 1,
    ]);
    expect(applies('standard', [0, 10, 150])).toEqual([1, 0, 1]);
  });

  it("Escoffier's skill: once per 1.5 s", () => {
    // Her Mek ticks every 58.5 frames: every other one applies.
    expect(applies('escoffierSkill', [0, 59, 117, 176, 234])).toEqual([
      1, 0, 1, 0, 1,
    ]);
  });

  it('applies nothing past the end of the sequence', () => {
    // Six quick hits: the sequence has one 1 and five 0s.
    expect(applies('escoffierSkill', [0, 1, 2, 3, 4, 5, 6])).toEqual([
      1, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('keeps tags apart', () => {
    const icd = createIcd();
    expect(icd.applies('a', undefined, 0)).toBe(1);
    expect(icd.applies('b', undefined, 1)).toBe(1);
    expect(icd.applies('a', undefined, 2)).toBe(0);
  });

  it('fails loudly on an unknown group', () => {
    expect(() => createIcd().applies('tag', 'nope', 0)).toThrow();
  });
});

describe('ICD groups in a file', () => {
  it('are checked at load', async () => {
    const { editCharacter } = await import('./fixtures');
    const { loadCharacterFile } = await import('../_lib/characterData');
    expect(() =>
      loadCharacterFile(
        editCharacter('mualani', (file) => {
          const rows = (file.talents as { rows: { timing?: object }[] }[])[0]
            .rows;
          Object.assign(rows[0].timing!, { icd: 'normal', icdGroup: 'nope' });
        })
      )
    ).toThrow(/unknown ICD group "nope"/);
  });
});

// Weapons and artifact sets live in a catalog, named by id from each
// character file; the loader puts the entry in place.
import { describe, expect, it } from 'vitest';

import { editCharacter } from './fixtures';
import { resolveCatalog, SET_IDS, WEAPON_IDS } from '../_lib/catalog';
import { getLoadedCharacter, loadCharacterFile } from '../_lib/characterData';
import { CHARACTER_LIST } from '../_lib/characters';

describe('the weapon and set catalog', () => {
  it('resolves every character’s weapon and set', () => {
    CHARACTER_LIST.forEach(({ id }) => {
      const { character } = getLoadedCharacter(id);
      expect(typeof character.weapon.name).toBe('string');
      expect(character.artifactSet.pieces).toHaveLength(5);
    });
    expect(WEAPON_IDS).toContain('favonius-lance');
    expect(SET_IDS).toContain('obsidian-codex');
  });

  it('shares one entry: Chevreuse and Iansan hold the same Favonius Lance', () => {
    expect(getLoadedCharacter('chevreuse').character.weapon).toEqual(
      getLoadedCharacter('iansan').character.weapon
    );
  });

  it('fails at load on an unknown id', () => {
    expect(() =>
      loadCharacterFile(
        editCharacter('mualani', (file) => {
          (file as { weapon: unknown }).weapon = 'no-such-weapon';
        })
      )
    ).toThrow(/unknown weapon "no-such-weapon"/);
  });

  it("fills the character's defaults with the entry's, never over them", () => {
    const resolved = resolveCatalog({
      name: 'Test',
      weapon: 'favonius-lance',
      artifactSet: 'obsidian-codex',
      defaults: { numbers: { favoniusRefinement: 3 }, flags: {} },
    }) as { weapon: { name: string }; defaults: { numbers: object } };
    expect(resolved.weapon.name).toBe('Favonius Lance');
    expect(resolved.defaults.numbers).toEqual({ favoniusRefinement: 3 });
  });
});

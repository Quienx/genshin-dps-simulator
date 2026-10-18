// The character sheet's number fields: what is valid, and the nearest
// valid value a field snaps to.
import { describe, expect, it } from 'vitest';

import { getRunOptionFields } from '../_lib/burstCharge';
import { getLoadedCharacter } from '../_lib/characterData';
import { CHARACTER_LIST } from '../_lib/characters';
import {
  clampNumberField,
  getFieldsBySection,
  numberFieldError,
} from '../_lib/simulationFields';
import { buildDefaultValues } from '../_lib/simulationValues';
import {
  buildPresetTeam,
  MAVUIKA_PRESETS,
  runTeamExpected,
} from '../_lib/team';

const energy = { min: 0, max: 60, step: 1 };

describe('a number field', () => {
  it('is valid inside its range', () => {
    expect(numberFieldError('0', energy)).toBeNull();
    expect(numberFieldError('60', energy)).toBeNull();
  });

  it('says why it is not', () => {
    expect(numberFieldError('6660', energy)).toBe('At most 60');
    expect(numberFieldError('-5', energy)).toBe('At least 0');
    expect(numberFieldError('', energy)).toBe('Enter a number');
    expect(numberFieldError('abc', energy)).toBe('Not a number');
    expect(numberFieldError('12.5', energy)).toBe('A whole number');
    // A field that steps by decimals takes them.
    expect(numberFieldError('12.5', { min: 0, step: 0.1 })).toBeNull();
  });

  it('snaps to the nearest valid value', () => {
    expect(clampNumberField('6660', energy)).toBe('60');
    expect(clampNumberField('-5', energy)).toBe('0');
    expect(clampNumberField('12.6', energy)).toBe('13');
    // Not a number: left for the user to fix.
    expect(clampNumberField('abc', energy)).toBe('abc');
  });
});

describe('every character’s defaults', () => {
  it.each(CHARACTER_LIST.map((character) => character))(
    'are valid in the sheet: $name',
    (character) => {
      const values = buildDefaultValues(character.id);
      const fields = [
        ...getFieldsBySection(character, 'stats'),
        ...getFieldsBySection(character, 'rotation'),
      ].filter((field) => field.kind === 'number');
      fields.forEach((field) => {
        const value = values.numbers[field.name];
        if (value !== undefined) {
          expect(
            numberFieldError(value, field),
            `${field.name} = ${value}`
          ).toBeNull();
        }
      });
    }
  );
});

describe('a member’s run options', () => {
  // Every kit whose Q costs something offers what it starts with: Energy,
  // or Mavuika's Fighting Spirit.
  it.each(CHARACTER_LIST.filter((character) => character.id !== 'arlecchino'))(
    'offer what the Q starts with: $name',
    (character) => {
      const names = getRunOptionFields(
        character,
        getLoadedCharacter(character.id).character
      ).map((field) => field.name);
      expect(names).toHaveLength(1);
      expect(['startingEnergy', 'startingFightingSpirit']).toContain(names[0]);
    }
  );

  // The first Q of a member: when it started, or null if it never did.
  const firstBurst = (
    characterId: string,
    numbers: Record<string, string>
  ): number | null => {
    const team = buildPresetTeam(MAVUIKA_PRESETS[0]);
    const run = runTeamExpected({
      ...team,
      members: team.members.map((values) =>
        values.character === characterId
          ? { ...values, numbers: { ...values.numbers, ...numbers } }
          : values
      ),
    });
    const entry = run.trace.find(
      (step) => step.action === `${characterId}:burst` && !step.skipped
    );
    return entry?.startTime ?? null;
  };

  it.each([
    ['citlali', 'startingEnergy'],
    ['mavuika', 'startingFightingSpirit'],
  ])('change the team run: %s’s %s', (characterId, field) => {
    const full = firstBurst(characterId, {});
    const empty = firstBurst(characterId, { [field]: '0' });
    expect(full).not.toBeNull();
    // With nothing at the start, the first Q waits (or never comes).
    expect(empty === null || empty > (full ?? 0)).toBe(true);
  });
});

import { CharacterData } from './characterSchema';
import { SheetStat } from './engine/schema';
import { readNumber } from './readValue';
import { ParsedValues, ScalingStat } from './types';

// The character's stats as a hit sees them before conditional bonuses.
export type StatSheet = {
  // Character + weapon base stats: what ATK%, HP% and DEF% multiply.
  base: Record<Exclude<SheetStat, 'em'>, number>;
  // The character screen's totals, as typed in the stat fields (they
  // already include every always-on bonus).
  total: Record<SheetStat, number>;
};

const readStat = (values: ParsedValues, name: SheetStat): number =>
  Math.max(0, readNumber(values, name));

export const buildStatSheet = (
  character: Pick<CharacterData, 'baseStats' | 'weapon'>,
  values: ParsedValues
): StatSheet => ({
  base: {
    atk: character.baseStats.atk + character.weapon.baseAtk,
    hp: character.baseStats.hp,
    def: character.baseStats.def,
  },
  total: {
    atk: readStat(values, 'atk'),
    hp: readStat(values, 'hp'),
    def: readStat(values, 'def'),
    em: readStat(values, 'em'),
  },
});

const STAT_FIELD_ORDER: ScalingStat[] = ['atk', 'hp', 'def'];

// ATK, HP and DEF the kit reads, so only those get a field: the scaling
// stat, the stats of every simulated talent row and of `ofStat` bonuses.
export const getUsedStats = (character: CharacterData): ScalingStat[] => {
  const rowStats = character.talents
    .flatMap((talent) => talent.rows)
    .flatMap((row) =>
      row.type === 'multiplier' && row.timing
        ? row.components.map((component) => component.stat)
        : []
    );
  const conversionStats = [
    ...character.blocks,
    ...character.artifactSet.blocks,
    ...character.weapon.blocks,
  ].flatMap((block) =>
    block.type === 'bonus' && block.ofStat ? [block.ofStat] : []
  );
  const used = new Set<string>([
    character.scalingStat,
    ...rowStats,
    ...conversionStats,
  ]);
  return STAT_FIELD_ORDER.filter((stat) => used.has(stat));
};

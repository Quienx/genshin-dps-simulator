// A standard artifact build (KQM's convention), so a character's default
// stats are computed, not guessed: 5★ +20 pieces with the given sands,
// goblet and circlet; 2 average rolls of every substat, plus 20 more spread
// over the given ones (stat:rolls, or evenly).
import {
  ARTIFACT_SLOTS,
  MAIN_STATS,
  SUBSTATS,
  SUBSTATS_PER_PIECE,
} from '../../src/app/genshin-dps-simulator/_lib/artifacts';
import { ScreenStat } from '../../src/app/genshin-dps-simulator/_lib/characterSchema';
import {
  ArtifactBuild,
  ArtifactLine,
  ArtifactSlot,
} from '../../src/app/genshin-dps-simulator/_lib/types';

// A 5★ substat's average roll.
export const AVERAGE_ROLL: Partial<Record<ScreenStat, number>> = {
  critRate: 3.31,
  critDamage: 6.62,
  atkPercent: 4.96,
  flatAtk: 16.54,
  hpPercent: 4.96,
  flatHp: 253.94,
  defPercent: 6.2,
  flatDef: 19.68,
  elementalMastery: 19.82,
  energyRecharge: 5.51,
};
export const FIXED_ROLLS = 2;
export const LIQUID_ROLLS = 20;

export type BuildSpec = {
  sands: ScreenStat;
  goblet: ScreenStat;
  circlet: ScreenStat;
  // Extra rolls per substat; their sum is LIQUID_ROLLS (an even spread
  // when only the stats are given).
  liquid: Partial<Record<ScreenStat, number>>;
};

// "critRate:8,critDamage:8,atkPercent" → rolls per stat (the ones without
// a count share what is left).
export const parseLiquid = (raw: string): BuildSpec['liquid'] => {
  const entries = raw
    .split(',')
    .filter(Boolean)
    .map((entry) => entry.split(':') as [ScreenStat, string?]);
  const given = entries.reduce(
    (sum, [, rolls]) => sum + (rolls ? Number(rolls) : 0),
    0
  );
  const open = entries.filter(([, rolls]) => !rolls);
  const share = open.length > 0 ? (LIQUID_ROLLS - given) / open.length : 0;
  return Object.fromEntries(
    entries.map(([stat, rolls]) => [stat, rolls ? Number(rolls) : share])
  );
};

const mainOf = (slot: ArtifactSlot, spec: BuildSpec): ArtifactLine => {
  const wanted =
    slot === 'sands'
      ? spec.sands
      : slot === 'goblet'
      ? spec.goblet
      : slot === 'circlet'
      ? spec.circlet
      : MAIN_STATS[slot][0].stat;
  const main = MAIN_STATS[slot].find((entry) => entry.stat === wanted);
  if (!main) {
    throw new Error(`A ${slot} has no ${wanted} main stat`);
  }
  return { stat: main.stat, value: String(main.value) };
};

// The build: each substat's total in one free slot of a piece whose main
// stat is another (only totals count).
export const buildArtifacts = (spec: BuildSpec): ArtifactBuild => {
  const pieces = Object.fromEntries(
    ARTIFACT_SLOTS.map((slot) => [
      slot,
      { main: mainOf(slot, spec), subs: [] as ArtifactLine[] },
    ])
  ) as ArtifactBuild['pieces'];
  SUBSTATS.forEach((stat) => {
    const rolls = FIXED_ROLLS + (spec.liquid[stat] ?? 0);
    const value = Math.round(rolls * (AVERAGE_ROLL[stat] ?? 0) * 100) / 100;
    const slot = ARTIFACT_SLOTS.find(
      (entry) =>
        pieces[entry].main.stat !== stat &&
        pieces[entry].subs.length < SUBSTATS_PER_PIECE
    );
    if (slot && value > 0) {
      pieces[slot].subs.push({ stat, value: String(value) });
    }
  });
  ARTIFACT_SLOTS.forEach((slot) => {
    while (pieces[slot].subs.length < SUBSTATS_PER_PIECE) {
      pieces[slot].subs.push({ stat: '', value: '' });
    }
  });
  return { enabled: true, pieces };
};

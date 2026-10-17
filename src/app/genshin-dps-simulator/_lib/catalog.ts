// The weapons and artifact sets every character file can name by id
// (`"weapon": "favonius-lance"`, `"artifactSet": "obsidian-codex"`): one
// file each in _data/weapons and _data/sets, shared by every character
// that uses it. A new one: its file (scripts/scaffold/weapon.ts or
// set.ts drafts it) and its import here.
import celestialGiftSet from '../_data/sets/celestial-gift.json';
import fragmentOfHarmonicWhimsySet from '../_data/sets/fragment-of-harmonic-whimsy.json';
import goldenTroupeSet from '../_data/sets/golden-troupe.json';
import longNightsOathSet from '../_data/sets/long-nights-oath.json';
import obsidianCodexSet from '../_data/sets/obsidian-codex.json';
import scrollOfTheHeroOfCinderCitySet from '../_data/sets/scroll-of-the-hero-of-cinder-city.json';
import songOfDaysPastSet from '../_data/sets/song-of-days-past.json';
import angelosHeptadesWeapon from '../_data/weapons/angelos-heptades.json';
import crimsonMoonsSemblanceWeapon from '../_data/weapons/crimson-moons-semblance.json';
import favoniusLanceWeapon from '../_data/weapons/favonius-lance.json';
import lostPrayerToTheSacredWindsWeapon from '../_data/weapons/lost-prayer-to-the-sacred-winds.json';
import surfsUpWeapon from '../_data/weapons/surfs-up.json';
import symphonistOfScentsWeapon from '../_data/weapons/symphonist-of-scents.json';

type Entry = { id: string; defaults?: Defaults } & Record<string, unknown>;
type Defaults = {
  numbers?: Record<string, number>;
  flags?: Record<string, boolean>;
};

const byId = (files: unknown[]): Map<string, Entry> =>
  new Map((files as Entry[]).map((file) => [file.id, file]));

const WEAPONS = byId([
  angelosHeptadesWeapon,
  crimsonMoonsSemblanceWeapon,
  favoniusLanceWeapon,
  lostPrayerToTheSacredWindsWeapon,
  surfsUpWeapon,
  symphonistOfScentsWeapon,
]);
const SETS = byId([
  celestialGiftSet,
  fragmentOfHarmonicWhimsySet,
  goldenTroupeSet,
  longNightsOathSet,
  obsidianCodexSet,
  scrollOfTheHeroOfCinderCitySet,
  songOfDaysPastSet,
]);

export const WEAPON_IDS = Array.from(WEAPONS.keys());
export const SET_IDS = Array.from(SETS.keys());

const lookup = (
  catalog: Map<string, Entry>,
  kind: string,
  id: string,
  character: string
) => {
  const entry = catalog.get(id);
  if (!entry) {
    throw new Error(`${character} names an unknown ${kind} "${id}"`);
  }
  return entry;
};

// A character file as the schema reads it: a weapon or set named by id is
// replaced by its catalog entry, whose `defaults` (its flags and fields,
// e.g. a refinement) fill those the character does not set.
export const resolveCatalog = (file: unknown): unknown => {
  if (!file || typeof file !== 'object') {
    return file;
  }
  const raw = file as Record<string, unknown> & { defaults?: Defaults };
  const name = String(raw.name ?? raw.id ?? 'A character');
  const entries = [
    typeof raw.weapon === 'string'
      ? ['weapon', lookup(WEAPONS, 'weapon', raw.weapon, name)]
      : null,
    typeof raw.artifactSet === 'string'
      ? ['artifactSet', lookup(SETS, 'artifact set', raw.artifactSet, name)]
      : null,
  ].filter((entry): entry is [string, Entry] => entry !== null);
  if (entries.length === 0) {
    return file;
  }
  const resolved: Record<string, unknown> = { ...raw };
  const defaults = {
    numbers: { ...raw.defaults?.numbers },
    flags: { ...raw.defaults?.flags },
  };
  entries.forEach(([key, entry]) => {
    const { id: _id, defaults: own, ...data } = entry;
    resolved[key] = data;
    defaults.numbers = { ...own?.numbers, ...defaults.numbers };
    defaults.flags = { ...own?.flags, ...defaults.flags };
  });
  resolved.defaults = defaults;
  return resolved;
};

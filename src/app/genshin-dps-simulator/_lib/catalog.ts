// The weapons and artifact sets every character file can name by id
// (`"weapon": "favonius-lance"`, `"artifactSet": "obsidian-codex"`): one
// file each in _data/weapons and _data/sets, shared by every character
// that uses it. A new one: its file (scripts/scaffold/weapon.ts or
// set.ts drafts it) and its import here.
import celestialGiftSet from '../_data/sets/celestial-gift.json';
import fragmentOfHarmonicWhimsySet from '../_data/sets/fragment-of-harmonic-whimsy.json';
import goldenTroupeSet from '../_data/sets/golden-troupe.json';
import longNightsOathSet from '../_data/sets/long-nights-oath.json';
import noblesseObligeSet from '../_data/sets/noblesse-oblige.json';
import obsidianCodexSet from '../_data/sets/obsidian-codex.json';
import scrollOfTheHeroOfCinderCitySet from '../_data/sets/scroll-of-the-hero-of-cinder-city.json';
import songOfDaysPastSet from '../_data/sets/song-of-days-past.json';
import viridescentVenererSet from '../_data/sets/viridescent-venerer.json';
import aThousandBlazingSunsWeapon from '../_data/weapons/a-thousand-blazing-suns.json';
import angelosHeptadesWeapon from '../_data/weapons/angelos-heptades.json';
import aquilaFavoniaWeapon from '../_data/weapons/aquila-favonia.json';
import crimsonMoonsSemblanceWeapon from '../_data/weapons/crimson-moons-semblance.json';
import favoniusLanceWeapon from '../_data/weapons/favonius-lance.json';
import favoniusSwordWeapon from '../_data/weapons/favonius-sword.json';
import lostPrayerToTheSacredWindsWeapon from '../_data/weapons/lost-prayer-to-the-sacred-winds.json';
import starcallersWatchWeapon from '../_data/weapons/starcallers-watch.json';
import surfsUpWeapon from '../_data/weapons/surfs-up.json';
import symphonistOfScentsWeapon from '../_data/weapons/symphonist-of-scents.json';
import thrillingTalesOfDragonSlayersWeapon from '../_data/weapons/thrilling-tales-of-dragon-slayers.json';
import wolfsGravestoneWeapon from '../_data/weapons/wolfs-gravestone.json';

type Entry = { id: string; defaults?: Defaults } & Record<string, unknown>;
type Defaults = {
  numbers?: Record<string, number>;
  flags?: Record<string, boolean>;
};

const byId = (files: unknown[]): Map<string, Entry> =>
  new Map((files as Entry[]).map((file) => [file.id, file]));

const WEAPONS = byId([
  aThousandBlazingSunsWeapon,
  angelosHeptadesWeapon,
  aquilaFavoniaWeapon,
  crimsonMoonsSemblanceWeapon,
  favoniusLanceWeapon,
  favoniusSwordWeapon,
  lostPrayerToTheSacredWindsWeapon,
  starcallersWatchWeapon,
  surfsUpWeapon,
  symphonistOfScentsWeapon,
  thrillingTalesOfDragonSlayersWeapon,
  wolfsGravestoneWeapon,
]);
const SETS = byId([
  celestialGiftSet,
  fragmentOfHarmonicWhimsySet,
  goldenTroupeSet,
  longNightsOathSet,
  noblesseObligeSet,
  obsidianCodexSet,
  scrollOfTheHeroOfCinderCitySet,
  songOfDaysPastSet,
  viridescentVenererSet,
]);

export const WEAPON_IDS = Array.from(WEAPONS.keys());
export const SET_IDS = Array.from(SETS.keys());

// What a picker shows for each entry.
export type CatalogOption = {
  id: string;
  name: string;
  icon: string;
  rarity?: number;
  // Weapons only: the type a character must use.
  type?: string;
};

export const WEAPON_OPTIONS: CatalogOption[] = Array.from(WEAPONS.values()).map(
  (entry) => ({
    id: entry.id,
    name: String(entry.name),
    icon: String(entry.icon),
    rarity: Number(entry.rarity),
    type: String(entry.type),
  })
);

export const SET_OPTIONS: CatalogOption[] = Array.from(SETS.values()).map(
  (entry) => ({
    id: entry.id,
    name: String(entry.name),
    icon: String(
      (entry.pieces as { icon: string }[] | undefined)?.[0]?.icon ?? ''
    ),
  })
);

export const isWeaponId = (id: string): boolean => WEAPONS.has(id);
export const isSetId = (id: string): boolean => SETS.has(id);

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

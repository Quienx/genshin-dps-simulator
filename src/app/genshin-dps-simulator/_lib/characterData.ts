import {
  ActionData,
  getCharacterActions,
  toRotationActions,
} from './actionSchema';
import {
  isSetId,
  isWeaponId,
  resolveCatalog,
  SET_OPTIONS,
  WEAPON_OPTIONS,
} from './catalog';
import { CharacterData, characterSchema } from './characterSchema';
import { validateReferences } from './engine/validateReferences';
import { RotationData } from './rotation/rotationSchema';
import { getMultiplierRow, getTalent } from './talents';
import arlecchinoJson from '../_data/characters/arlecchino.json';
import bennettJson from '../_data/characters/bennett.json';
import chevreuseJson from '../_data/characters/chevreuse.json';
import citlaliJson from '../_data/characters/citlali.json';
import columbinaJson from '../_data/characters/columbina.json';
import escoffierJson from '../_data/characters/escoffier.json';
import iansanJson from '../_data/characters/iansan.json';
import mavuikaJson from '../_data/characters/mavuika.json';
import mualaniJson from '../_data/characters/mualani.json';
import neferJson from '../_data/characters/nefer.json';
import nicoleJson from '../_data/characters/nicole.json';
import sucroseJson from '../_data/characters/sucrose.json';
import varesaJson from '../_data/characters/varesa.json';
import xilonenJson from '../_data/characters/xilonen.json';

// Every character file. Adding a character is adding its JSON here.
const CHARACTER_FILES: unknown[] = [
  arlecchinoJson,
  mualaniJson,
  varesaJson,
  iansanJson,
  chevreuseJson,
  nicoleJson,
  escoffierJson,
  mavuikaJson,
  citlaliJson,
  bennettJson,
  xilonenJson,
  sucroseJson,
  neferJson,
  columbinaJson,
];

// Parsing at import time makes a malformed character file fail loudly on
// load instead of producing NaN damage deep inside a simulation.
export const CHARACTER_DATA: CharacterData[] = CHARACTER_FILES.map((file) =>
  characterSchema.parse(resolveCatalog(file))
);

const ids = CHARACTER_DATA.map((character) => character.id);
const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
if (duplicate) {
  throw new Error(`Two character files use the id "${duplicate}"`);
}

export const getCharacterData = (id: string): CharacterData => {
  const character = CHARACTER_DATA.find((entry) => entry.id === id);
  if (!character) {
    throw new Error(`No character file with the id "${id}"`);
  }
  return character;
};

// Every action the character's talents define, with full talent row
// references. A hit pointing at a row that does not exist fails here.
const loadActions = (character: CharacterData): Record<string, ActionData> => {
  const actions = getCharacterActions(character.talents);
  character.actionRules.forEach((rule) => {
    const action = actions[rule.action];
    if (!action) {
      throw new Error(
        `${character.name}'s action rule names an unknown action "${rule.action}"`
      );
    }
    if (rule.requires) {
      action.requires = { if: rule.requires, message: rule.message };
    }
    if (rule.cooldown) {
      action.cooldown = rule.cooldown;
    }
    if (rule.replacedBy) {
      rule.replacedBy.forEach((replacement) => {
        const target = actions[replacement.action];
        if (!target) {
          throw new Error(
            `${character.name}'s "${rule.action}" turns into an unknown action "${replacement.action}"`
          );
        }
        target.hidden = true;
      });
      action.replacements = [
        ...(action.replacements ?? []),
        ...rule.replacedBy,
      ];
    }
  });
  // Forms sharing a cooldown take it as the rules left it.
  Object.values(actions).forEach((action) => {
    if (action.sharesCooldownOf) {
      action.cooldown = actions[action.sharesCooldownOf].cooldown;
    }
  });
  Object.values(actions)
    .flatMap((action) => [
      ...(action.hits ?? []),
      ...(action.combo ?? []).flatMap((step) => step.hits),
    ])
    .forEach((hit) => {
      const [talentId, rowId] = hit.row.split('/');
      getMultiplierRow(getTalent(character, talentId), rowId);
    });
  return actions;
};

// The rotation editor's palette: the talents' actions plus the kit's extra
// ones (Dodge and Wait are added later for everyone). With a `palette`, only
// those ids show, in that order.
const loadRotation = (
  character: CharacterData,
  actions: Record<string, ActionData>
): RotationData | undefined => {
  if (!character.rotation) {
    return undefined;
  }
  const { automaticDescription, extraActions, palette } = character.rotation;
  const all = [...toRotationActions(actions), ...extraActions];
  if (!palette) {
    return { automaticDescription, actions: all };
  }
  const unknown = palette.find((id) => !all.some((action) => action.id === id));
  if (unknown) {
    throw new Error(
      `${character.name}'s rotation palette names an unknown action "${unknown}"`
    );
  }
  const listed = palette.map((id) => all.find((action) => action.id === id)!);
  const others = all
    .filter((action) => !palette.includes(action.id))
    .map((action) => ({ ...action, hidden: true }));
  return {
    automaticDescription,
    actions: [
      ...listed.map((action) => ({ ...action, hidden: false })),
      ...others,
    ],
  };
};

// Everything the engine needs to simulate a character file.
export type LoadedCharacter = {
  character: CharacterData;
  actions: Record<string, ActionData>;
  rotation: RotationData | undefined;
};

const load = (character: CharacterData): LoadedCharacter => {
  validateReferences(character);
  const actions = loadActions(character);
  return { character, actions, rotation: loadRotation(character, actions) };
};

// Validates and loads any character file, registered or not (tests, new
// files being written).
export const loadCharacterFile = (file: unknown): LoadedCharacter =>
  load(characterSchema.parse(resolveCatalog(file)));

const LOADED = CHARACTER_DATA.map(load);

const getBaseLoaded = (id: string): LoadedCharacter => {
  const loaded = LOADED.find((entry) => entry.character.id === id);
  if (!loaded) {
    throw new Error(`No character file with the id "${id}"`);
  }
  return loaded;
};

// A character as the timeline shows it: with the gear of the build shown
// (showBuilds), else its file's.
export const getLoadedCharacter = (id: string): LoadedCharacter => {
  const gear = SHOWN.get(id);
  return gear ? getLoadedVariant(id, gear) : getBaseLoaded(id);
};

export const CHARACTER_ACTIONS: Record<
  string,
  Record<string, ActionData>
> = Object.fromEntries(
  LOADED.map(({ character, actions }) => [character.id, actions])
);

// ---------------------------------------------------------------- gear

// A build may wear another catalog weapon (of the character's weapon type)
// or artifact set than its file names (`SimulationValues.weapon` /
// `.artifactSet`). Unknown ids, a weapon of another type, or an entry the
// kit cannot load (a set reading Nightsoul on a non-Natlan character) fall
// back to the file's.
export type Gear = { weapon?: string; artifactSet?: string };

type CharacterFile = {
  id: string;
  weapon?: string;
  artifactSet?: string;
  weaponType?: string;
};
const FILES = new Map(
  (CHARACTER_FILES as CharacterFile[]).map((file) => [file.id, file])
);

// The ids a character file names (its default gear).
export const getFileGear = (id: string): Required<Gear> => {
  const file = FILES.get(id);
  return {
    weapon: file?.weapon ?? '',
    artifactSet: file?.artifactSet ?? '',
  };
};

// What the entries switched in turn on by default, when the file does not
// say: the weapon (its flag, refinement 1) and every set bonus.
const withGearDefaults = (character: CharacterData): CharacterData => {
  const numbers = { ...character.defaults.numbers };
  const flags = { ...character.defaults.flags };
  const { weapon, artifactSet } = character;
  flags[weapon.enabledFlag] ??= true;
  numbers[weapon.refinementField] ??= 1;
  artifactSet.rows.forEach((row) => {
    if (row.flag) {
      flags[row.flag] ??= true;
    }
  });
  return { ...character, defaults: { ...character.defaults, numbers, flags } };
};

const VARIANTS = new Map<string, LoadedCharacter | null>();

const loadVariant = (
  file: CharacterFile,
  weapon: string,
  artifactSet: string
): LoadedCharacter | null => {
  const key = `${file.id}|${weapon}|${artifactSet}`;
  if (!VARIANTS.has(key)) {
    try {
      const character = characterSchema.parse(
        resolveCatalog({ ...file, weapon, artifactSet })
      );
      VARIANTS.set(key, load(withGearDefaults(character)));
    } catch {
      VARIANTS.set(key, null);
    }
  }
  return VARIANTS.get(key) ?? null;
};

const isWeaponFor = (file: CharacterFile, id: string): boolean =>
  isWeaponId(id) &&
  WEAPON_OPTIONS.find((option) => option.id === id)?.type === file.weaponType;

// The character wearing this gear (each part only when it is valid).
export const getLoadedVariant = (
  id: string,
  gear: Gear = {}
): LoadedCharacter => {
  const base = getBaseLoaded(id);
  const file = FILES.get(id);
  if (!file) {
    return base;
  }
  const weapon =
    gear.weapon && isWeaponFor(file, gear.weapon) ? gear.weapon : file.weapon;
  const artifactSet =
    gear.artifactSet && isSetId(gear.artifactSet)
      ? gear.artifactSet
      : file.artifactSet;
  if (weapon === file.weapon && artifactSet === file.artifactSet) {
    return base;
  }
  return loadVariant(file, weapon ?? '', artifactSet ?? '') ?? base;
};

// The weapons and sets a character can wear (those its kit loads with).
export const getGearOptions = (id: string) => {
  const file = FILES.get(id);
  if (!file) {
    return { weapons: [], sets: [] };
  }
  const fileGear = getFileGear(id);
  const loads = (weapon: string, artifactSet: string) =>
    (weapon === fileGear.weapon && artifactSet === fileGear.artifactSet) ||
    loadVariant(file, weapon, artifactSet) !== null;
  return {
    weapons: WEAPON_OPTIONS.filter(
      (option) =>
        option.type === file.weaponType &&
        loads(option.id, fileGear.artifactSet)
    ),
    sets: SET_OPTIONS.filter((option) => loads(fileGear.weapon, option.id)),
  };
};

// The builds the timeline shows: what the display code (the inspector,
// team snapshots) reads through getLoadedCharacter. Runs never need it:
// they load each member's gear from its values.
const SHOWN = new Map<string, Gear>();
export const showBuilds = (builds: ({ character: string } & Gear)[]) => {
  SHOWN.clear();
  builds.forEach(({ character, weapon, artifactSet }) => {
    if (weapon || artifactSet) {
      SHOWN.set(character, { weapon, artifactSet });
    }
  });
};

export const CHARACTER_ROTATIONS: Record<string, RotationData | undefined> =
  Object.fromEntries(
    LOADED.map(({ character, rotation }) => [character.id, rotation])
  );

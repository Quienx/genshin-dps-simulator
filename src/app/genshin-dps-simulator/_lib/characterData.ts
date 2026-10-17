import {
  ActionData,
  getCharacterActions,
  toRotationActions,
} from './actionSchema';
import { CharacterData, characterSchema } from './characterSchema';
import { validateReferences } from './engine/validateReferences';
import { RotationData } from './rotation/rotationSchema';
import { getMultiplierRow, getTalent } from './talents';
import arlecchinoJson from '../_data/characters/arlecchino.json';
import chevreuseJson from '../_data/characters/chevreuse.json';
import iansanJson from '../_data/characters/iansan.json';
import mualaniJson from '../_data/characters/mualani.json';
import nicoleJson from '../_data/characters/nicole.json';
import varesaJson from '../_data/characters/varesa.json';

// Every character file. Adding a character is adding its JSON here.
const CHARACTER_FILES: unknown[] = [
  arlecchinoJson,
  mualaniJson,
  varesaJson,
  iansanJson,
  chevreuseJson,
  nicoleJson,
];

// Parsing at import time makes a malformed character file fail loudly on
// load instead of producing NaN damage deep inside a simulation.
export const CHARACTER_DATA: CharacterData[] = CHARACTER_FILES.map((file) =>
  characterSchema.parse(file)
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
  load(characterSchema.parse(file));

const LOADED = CHARACTER_DATA.map(load);

export const getLoadedCharacter = (id: string): LoadedCharacter => {
  const loaded = LOADED.find((entry) => entry.character.id === id);
  if (!loaded) {
    throw new Error(`No character file with the id "${id}"`);
  }
  return loaded;
};

export const CHARACTER_ACTIONS: Record<
  string,
  Record<string, ActionData>
> = Object.fromEntries(
  LOADED.map(({ character, actions }) => [character.id, actions])
);

export const CHARACTER_ROTATIONS: Record<string, RotationData | undefined> =
  Object.fromEntries(
    LOADED.map(({ character, rotation }) => [character.id, rotation])
  );

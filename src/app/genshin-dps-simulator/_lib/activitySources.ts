import { CharacterData } from './characterSchema';
import { ActivityBlock } from './engine/runtime';
import { iconUrl, relicIconUrl } from './genshinIcons';

// "c2", "c6CritBuff": the constellation a flag or block id refers to.
const getConstellationLevel = (block: ActivityBlock): number | null => {
  const match = (block.ifFlag ?? block.id).match(/^c([1-6])/);
  return match ? Number(match[1]) : null;
};

const findConstellation = (character: CharacterData, block: ActivityBlock) => {
  const level = getConstellationLevel(block);
  return character.constellations.find((entry) => entry.level === level);
};

// A passive is tied to its blocks by its toggle flag.
const findPassive = (character: CharacterData, block: ActivityBlock) =>
  character.passives.find(
    (entry) => entry.toggleFlag && entry.toggleFlag === block.ifFlag
  );

// Image of a block's timeline row: its own `icon`, else the constellation,
// passive, weapon or artifact set it belongs to. Null when none is known
// (e.g. a talent block without an `icon`, or a shared system).
export const getBlockIconUrl = (
  character: CharacterData,
  block: ActivityBlock
): string | null => {
  if (block.icon) {
    return iconUrl(block.icon);
  }
  switch (block.source) {
    case 'constellation': {
      const constellation = findConstellation(character, block);
      return constellation ? iconUrl(constellation.icon) : null;
    }
    case 'passive': {
      const passive = findPassive(character, block);
      return passive ? iconUrl(passive.icon) : null;
    }
    case 'weapon':
      return iconUrl(character.weapon.icon);
    case 'artifact': {
      const [piece] = character.artifactSet.pieces;
      return piece ? relicIconUrl(piece.icon) : null;
    }
    default:
      return null;
  }
};

// Ends with a full stop unless it already has one.
const sentence = (text: string): string =>
  /[.!?)]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const join = (parts: (string | undefined)[]): string | null => {
  const text = parts
    .filter((part): part is string => Boolean(part))
    .map(sentence)
    .join(' ');
  return text || null;
};

// The text the character file has for what a block comes from: the
// passive's or constellation's effect, the weapon's passive, the set
// bonus. Null for talent blocks and shared systems.
export const getBlockDescription = (
  character: CharacterData,
  block: ActivityBlock
): string | null => {
  switch (block.source) {
    case 'constellation': {
      const constellation = findConstellation(character, block);
      return constellation
        ? sentence(
            `C${constellation.level} ${constellation.name.replace(
              /[.!?…]+$/,
              ''
            )}: ${constellation.effect}`
          )
        : null;
    }
    case 'passive': {
      const passive = findPassive(character, block);
      return passive
        ? join([`${passive.name}: ${passive.value}`, passive.note])
        : null;
    }
    case 'weapon': {
      const notes = character.weapon.rows
        .map((row) => row.note)
        .filter((note): note is string => Boolean(note));
      return join([character.weapon.name, ...notes]);
    }
    case 'artifact': {
      const { artifactSet } = character;
      const row = artifactSet.rows.find(
        (entry) => entry.flag && entry.flag === block.ifFlag
      );
      return row
        ? join([`${artifactSet.name} ${row.label}: ${row.value}`, row.note])
        : `${artifactSet.name}.`;
    }
    default:
      return null;
  }
};

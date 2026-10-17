import {
  COMPUTED_STAT_FIELDS,
  computeScreenStats,
  formatScreenTotals,
} from './artifacts';
import { CHARACTERS } from './characters';
import { CharacterData } from './characterSchema';
import { getBuildEffects, getMaxDamageBonus } from './effects';
import formatNumber from './formatNumber';
import { iconUrl, relicIconUrl } from './genshinIcons';
import { readFlag } from './readValue';
import { ArtifactSetView, CharacterBuildView } from './sectionTypes';
import { getFieldsBySection } from './simulationFields';
import { parseValues } from './simulationValues';
import { KitStatus, SimulationValues } from './types';

export const getCharacterBuildView = (
  character: CharacterData,
  values: SimulationValues
): CharacterBuildView => {
  const definition = CHARACTERS[character.id];
  return {
    name: character.name,
    avatarSrc: iconUrl(character.icons.avatar),
    highlight: {
      label: 'Max active extra DMG Bonus',
      value: `+${formatNumber(
        getMaxDamageBonus(getBuildEffects(character), parseValues(values))
      )}%`,
    },
    // While artifacts are on, the totals come from them (artifacts card).
    statFields: getFieldsBySection(definition, 'stats').filter(
      (field) =>
        !values.artifacts?.enabled || !COMPUTED_STAT_FIELDS.has(field.name)
    ),
    screenTotals: values.artifacts?.enabled
      ? formatScreenTotals(
          character,
          computeScreenStats(character, parseValues(values), values.artifacts)
        )
      : null,
    talentFields: getFieldsBySection(definition, 'talents'),
  };
};

// Rows with a flag follow it; rows without one are always part of the set.
const getRowStatus = (
  flag: string | undefined,
  values: ReturnType<typeof parseValues>
): KitStatus => {
  if (!flag) {
    return 'included';
  }
  return readFlag(values, flag) ? 'applied' : 'disabled';
};

export const getArtifactSetView = (
  character: CharacterData,
  values: SimulationValues
): ArtifactSetView => {
  const parsedValues = parseValues(values);
  const { artifactSet } = character;
  return {
    name: artifactSet.name,
    subtitle: `${artifactSet.name} ×4`,
    pieces: artifactSet.pieces.map((piece) => ({
      id: piece.id,
      label: piece.label,
      src: relicIconUrl(piece.icon),
    })),
    // Lit when any of its toggleable bonuses is on.
    isActive: artifactSet.rows.some(
      (row) => row.flag !== undefined && readFlag(parsedValues, row.flag)
    ),
    fields: getFieldsBySection(CHARACTERS[character.id], 'artifacts'),
    rows: artifactSet.rows.map((row) => ({
      id: row.id,
      label: row.label,
      value: row.value,
      status: getRowStatus(row.flag, parsedValues),
      note: row.note,
    })),
  };
};
